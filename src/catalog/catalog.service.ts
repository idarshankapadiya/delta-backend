import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { ulid } from 'ulid';
import {
  formatCatalogLabel,
  normalizeCatalogName,
  slugifyCatalogName,
} from './catalog-name.utils';
import {
  CatalogAction,
  CatalogCompanyUpdateResult,
  CatalogDocumentRevision,
  CatalogDocumentSummary,
  CatalogLibraryResponse,
  CatalogMetadata,
  CatalogNavigationCategory,
  CatalogNavigationCompany,
  CatalogNavigationResponse,
  CatalogStorageObject,
  SignedDocumentAccess,
} from './catalog.types';

type GcsFile = ReturnType<ReturnType<Storage['bucket']>['file']>;

interface DocumentLookup {
  objectName: string;
  relativeName: string;
  documentId: string;
  object?: CatalogStorageObject;
}

interface CatalogDocumentRecord extends CatalogDocumentSummary {
  object_name: string;
  relative_name: string;
  original_file_name: string;
  uploaded_at?: string;
}

interface CatalogDocumentSelection {
  company_slug: string;
  category_slug?: string;
  document_slug: string;
}

interface CatalogDocumentUploadInput {
  pdf: Buffer;
  uploadedFileName: string;
  companyName: string;
  categoryName?: string;
  documentName: string;
}

interface CatalogDocumentUpdateInput {
  pdf?: Buffer;
  uploadedFileName?: string;
  categoryName?: string;
  documentName?: string;
}

interface GcsObjectMetadata {
  size?: string | number;
  contentType?: string;
  timeCreated?: string;
  updated?: string;
  metadata?: Record<string, string>;
}

interface CatalogNameIdentity {
  name: string;
  slug: string;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly storage = new Storage();

  async getCatalogAll(): Promise<CatalogNavigationResponse> {
    return this.buildCatalogNavigation(await this.listPdfObjects());
  }

  async getCatalogLibrary(
    companySlugs: string[],
  ): Promise<CatalogLibraryResponse> {
    const requestedSlugs = new Set(
      companySlugs.map(slugifyCatalogName).filter(Boolean),
    );
    const catalog = await this.getCatalogAll();

    return {
      companies: catalog.companies
        .filter((company) => requestedSlugs.has(company.company_slug))
        .map((company) => ({
          company_slug: company.company_slug,
          company_name: company.company_name,
          document_count: company.document_count,
          examples: this.getCompanyDocuments(company),
        })),
    };
  }

  async documentSelectionExists(
    selection: CatalogDocumentSelection,
  ): Promise<boolean> {
    return Boolean(await this.findDocumentBySelection(selection));
  }

  async createSignedUrlForSelection(
    selection: CatalogDocumentSelection,
    action: CatalogAction,
  ): Promise<SignedDocumentAccess> {
    const lookup = await this.findDocumentBySelection(selection);

    if (!lookup) {
      throw new ServiceUnavailableException('Document is not available');
    }

    const ttlSeconds = this.getSignedUrlTtlSeconds();
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    const fileName = this.getFileName(lookup.relativeName);
    const dispositionType = action === 'download' ? 'attachment' : 'inline';

    try {
      const [url] = await this.storage
        .bucket(this.getBucketName())
        .file(lookup.objectName)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: expiresAt,
          responseDisposition: `${dispositionType}; filename="${this.escapeQuotedValue(fileName)}"`,
          responseType: 'application/pdf',
        });

      return {
        document_id: lookup.documentId,
        url,
        expires_at: expiresAt.toISOString(),
        ttl_seconds: ttlSeconds,
        file_name: fileName,
      };
    } catch (error) {
      throw new InternalServerErrorException('Unable to create signed URL', {
        cause: error,
      });
    }
  }

  async createCatalogDocument(
    input: CatalogDocumentUploadInput,
  ): Promise<CatalogDocumentRevision> {
    this.assertValidPdfUpload(input.pdf, input.uploadedFileName);

    const requestedCompany = this.assertCatalogName(
      input.companyName,
      'company_name',
    );
    const requestedDocument = this.assertCatalogName(
      input.documentName,
      'document_name',
    );
    const requestedCategory = input.categoryName
      ? this.assertCatalogName(input.categoryName, 'category_name')
      : undefined;
    const uploadedFileName = this.normalizeUploadedPdfFileName(
      input.uploadedFileName,
    );
    const objects = await this.listPdfObjects();
    const records = this.createDocumentRecords(objects);
    const existingCompany = this.findCanonicalCompany(
      records,
      requestedCompany.slug,
    );
    const companyName = existingCompany?.company_name ?? requestedCompany.name;
    const existingCategory = requestedCategory
      ? this.findCanonicalCategory(
          records,
          requestedCompany.slug,
          requestedCategory.slug,
        )
      : undefined;
    const categoryName =
      existingCategory?.category_name ?? requestedCategory?.name;
    const categorySlug = requestedCategory?.slug;

    if (
      records.some(
        (record) =>
          record.company_slug === requestedCompany.slug &&
          record.document_slug === requestedDocument.slug,
      )
    ) {
      throw new ConflictException('Catalog document already exists');
    }

    const objectName = this.createPrivateDocumentObjectName(
      requestedCompany.slug,
      categorySlug,
      uploadedFileName,
    );
    const thumbnailObjectName = this.createCatalogThumbnailObjectName(
      requestedCompany.slug,
      categorySlug,
      uploadedFileName,
    );
    const file = this.storage.bucket(this.getBucketName()).file(objectName);
    const thumbnailFile = this.storage
      .bucket(this.getPublicAssetBucketName())
      .file(thumbnailObjectName);

    await this.assertDestinationAvailable(
      file,
      'Catalog PDF file already exists',
    );
    await this.assertDestinationAvailable(
      thumbnailFile,
      'Catalog thumbnail already exists',
    );

    const documentId = ulid();
    const thumbnail = await this.generatePdfThumbnail(input.pdf);
    const customMetadata = this.createDocumentCustomMetadata({
      documentId,
      companyName,
      companySlug: requestedCompany.slug,
      categoryName,
      categorySlug,
      documentName: requestedDocument.name,
      documentSlug: requestedDocument.slug,
      originalFileName: uploadedFileName,
    });

    try {
      await this.savePdfObject(file, input.pdf, customMetadata);
      await this.savePublicThumbnail(thumbnailFile, thumbnail);
    } catch (error) {
      await Promise.all([
        this.deleteObjectIfExists(file),
        this.deleteObjectIfExists(thumbnailFile),
      ]);
      throw new InternalServerErrorException('Unable to create document', {
        cause: error,
      });
    }

    return this.createDocumentRevisionResponse({
      documentId,
      objectName,
      relativeName: this.stripConfiguredPrefix(objectName),
      size: input.pdf.length,
      contentType: 'application/pdf',
      companyName,
      companySlug: requestedCompany.slug,
      categoryName,
      categorySlug,
      documentName: requestedDocument.name,
      documentSlug: requestedDocument.slug,
      uploadedFileName,
    });
  }

  async updateCatalogDocument(
    documentId: string,
    input: CatalogDocumentUpdateInput,
  ): Promise<CatalogDocumentRevision> {
    if (
      input.pdf === undefined &&
      input.documentName === undefined &&
      input.categoryName === undefined
    ) {
      throw new BadRequestException('PDF file or metadata update is required');
    }

    if (input.pdf !== undefined) {
      if (!input.uploadedFileName) {
        throw new BadRequestException('Uploaded file name is required');
      }
      this.assertValidPdfUpload(input.pdf, input.uploadedFileName);
    }

    const objects = await this.listPdfObjects();
    const records = this.createDocumentRecords(objects);
    const record = records.find((item) => item.document_id === documentId);

    if (!record) {
      throw new NotFoundException('Document was not found');
    }

    const nextDocument =
      input.documentName === undefined
        ? { name: record.document_name, slug: record.document_slug }
        : this.assertCatalogName(input.documentName, 'document_name');

    if (
      records.some(
        (item) =>
          item.document_id !== record.document_id &&
          item.company_slug === record.company_slug &&
          item.document_slug === nextDocument.slug,
      )
    ) {
      throw new ConflictException('Catalog document already exists');
    }

    let categoryName = record.category_name;
    let categorySlug = record.category_slug;

    if (input.categoryName !== undefined) {
      const normalizedCategory = normalizeCatalogName(input.categoryName);

      if (!normalizedCategory) {
        categoryName = undefined;
        categorySlug = undefined;
      } else {
        const requestedCategory = this.assertCatalogName(
          normalizedCategory,
          'category_name',
        );
        const existingCategory = this.findCanonicalCategory(
          records.filter((item) => item.document_id !== record.document_id),
          record.company_slug,
          requestedCategory.slug,
        );

        categoryName =
          existingCategory?.category_name ?? requestedCategory.name;
        categorySlug = requestedCategory.slug;
      }
    }

    const uploadedFileName = input.uploadedFileName
      ? this.normalizeUploadedPdfFileName(input.uploadedFileName)
      : record.original_file_name;
    const nextObjectName = this.createPrivateDocumentObjectName(
      record.company_slug,
      categorySlug,
      uploadedFileName,
    );
    const currentThumbnailName = this.createCatalogThumbnailObjectName(
      record.company_slug,
      record.category_slug,
      record.original_file_name,
    );
    const nextThumbnailName = this.createCatalogThumbnailObjectName(
      record.company_slug,
      categorySlug,
      uploadedFileName,
    );
    const currentFile = this.storage
      .bucket(this.getBucketName())
      .file(record.object_name);
    const nextFile = this.storage
      .bucket(this.getBucketName())
      .file(nextObjectName);
    const currentThumbnail = this.storage
      .bucket(this.getPublicAssetBucketName())
      .file(currentThumbnailName);
    const nextThumbnail = this.storage
      .bucket(this.getPublicAssetBucketName())
      .file(nextThumbnailName);
    const pdfPathChanged = nextObjectName !== record.object_name;
    const thumbnailPathChanged = nextThumbnailName !== currentThumbnailName;

    if (pdfPathChanged) {
      await this.assertDestinationAvailable(
        nextFile,
        'Catalog PDF file already exists',
      );
    }
    if (thumbnailPathChanged) {
      await this.assertDestinationAvailable(
        nextThumbnail,
        'Catalog thumbnail already exists',
      );
    }

    const customMetadata = this.createDocumentCustomMetadata({
      documentId: record.document_id,
      companyName: record.company_name,
      companySlug: record.company_slug,
      categoryName,
      categorySlug,
      documentName: nextDocument.name,
      documentSlug: nextDocument.slug,
      originalFileName: uploadedFileName,
      uploadedAt: record.uploaded_at,
    });
    const customMetadataPatch =
      this.createDocumentCustomMetadataPatch(customMetadata);

    try {
      if (input.pdf !== undefined) {
        const thumbnail = await this.generatePdfThumbnail(input.pdf);
        await this.savePdfObject(nextFile, input.pdf, customMetadata);
        await this.savePublicThumbnail(nextThumbnail, thumbnail);
      } else if (pdfPathChanged) {
        await currentFile.copy(nextFile);
        await nextFile.setMetadata({ metadata: customMetadataPatch });

        if (thumbnailPathChanged) {
          await this.copyObjectIfExists(currentThumbnail, nextThumbnail);
        }
      } else {
        await currentFile.setMetadata({ metadata: customMetadataPatch });
      }
    } catch (error) {
      if (pdfPathChanged) {
        await this.deleteObjectIfExists(nextFile);
      }
      if (thumbnailPathChanged) {
        await this.deleteObjectIfExists(nextThumbnail);
      }
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Unable to update document', {
        cause: error,
      });
    }

    if (pdfPathChanged) {
      await this.deleteObjectIfExists(currentFile);
    }
    if (thumbnailPathChanged) {
      await this.deleteObjectIfExists(currentThumbnail);
    }

    const metadata = await this.getFileMetadata(nextFile);
    return this.createDocumentRevisionResponse({
      documentId: record.document_id,
      objectName: nextObjectName,
      relativeName: this.stripConfiguredPrefix(nextObjectName),
      size: this.parseSize(metadata.size) ?? input.pdf?.length ?? 0,
      contentType: metadata.contentType ?? 'application/pdf',
      updatedAt: metadata.updated,
      companyName: record.company_name,
      companySlug: record.company_slug,
      categoryName,
      categorySlug,
      documentName: nextDocument.name,
      documentSlug: nextDocument.slug,
      uploadedFileName,
    });
  }

  async updateCatalogCompany(
    currentCompanySlug: string,
    requestedCompanyName: string,
  ): Promise<CatalogCompanyUpdateResult> {
    const sourceSlug = slugifyCatalogName(currentCompanySlug);
    const requestedCompany = this.assertCatalogName(
      requestedCompanyName,
      'company_name',
    );
    const objects = await this.listPdfObjects();
    const records = this.createDocumentRecords(objects);
    const sourceRecords = records.filter(
      (record) => record.company_slug === sourceSlug,
    );

    if (!sourceRecords.length) {
      throw new NotFoundException('Company was not found');
    }

    if (requestedCompany.slug === sourceSlug) {
      try {
        await Promise.all(
          sourceRecords.map((record) =>
            this.storage
              .bucket(this.getBucketName())
              .file(record.object_name)
              .setMetadata({
                metadata: this.createDocumentCustomMetadataPatch(
                  this.createDocumentCustomMetadata({
                    documentId: record.document_id,
                    companyName: requestedCompany.name,
                    companySlug: sourceSlug,
                    categoryName: record.category_name,
                    categorySlug: record.category_slug,
                    documentName: record.document_name,
                    documentSlug: record.document_slug,
                    originalFileName: record.original_file_name,
                    uploadedAt: record.uploaded_at,
                  }),
                ),
              }),
          ),
        );
      } catch (error) {
        throw new InternalServerErrorException('Unable to update company', {
          cause: error,
        });
      }

      return {
        ok: true,
        previous_company_slug: sourceSlug,
        company_slug: sourceSlug,
        company_name: requestedCompany.name,
        moved_document_count: 0,
        merged: false,
      };
    }

    const targetRecords = records.filter(
      (record) => record.company_slug === requestedCompany.slug,
    );
    const targetCompany = this.findCanonicalCompany(
      targetRecords,
      requestedCompany.slug,
    );
    const companyName = targetCompany?.company_name ?? requestedCompany.name;

    for (const source of sourceRecords) {
      if (
        targetRecords.some(
          (target) => target.document_slug === source.document_slug,
        )
      ) {
        throw new ConflictException(
          `Document slug already exists in destination company: ${source.document_slug}`,
        );
      }
    }

    const destinations = sourceRecords.map((record) => {
      const canonicalCategory = record.category_slug
        ? this.findCanonicalCategory(
            targetRecords,
            requestedCompany.slug,
            record.category_slug,
          )
        : undefined;
      const categoryName =
        canonicalCategory?.category_name ?? record.category_name;
      const objectName = this.createPrivateDocumentObjectName(
        requestedCompany.slug,
        record.category_slug,
        record.original_file_name,
      );
      const thumbnailName = this.createCatalogThumbnailObjectName(
        requestedCompany.slug,
        record.category_slug,
        record.original_file_name,
      );

      return {
        record,
        categoryName,
        objectName,
        thumbnailName,
        metadata: this.createDocumentCustomMetadataPatch(
          this.createDocumentCustomMetadata({
            documentId: record.document_id,
            companyName,
            companySlug: requestedCompany.slug,
            categoryName,
            categorySlug: record.category_slug,
            documentName: record.document_name,
            documentSlug: record.document_slug,
            originalFileName: record.original_file_name,
            uploadedAt: record.uploaded_at,
          }),
        ),
      };
    });

    const destinationNames = new Set<string>();
    for (const destination of destinations) {
      if (destinationNames.has(destination.objectName)) {
        throw new ConflictException('Duplicate destination PDF path');
      }
      destinationNames.add(destination.objectName);

      await this.assertDestinationAvailable(
        this.storage.bucket(this.getBucketName()).file(destination.objectName),
        'Catalog PDF file already exists in destination company',
      );
      await this.assertDestinationAvailable(
        this.storage
          .bucket(this.getPublicAssetBucketName())
          .file(destination.thumbnailName),
        'Catalog thumbnail already exists in destination company',
      );
    }

    const createdPdfFiles: GcsFile[] = [];
    const createdThumbnailFiles: GcsFile[] = [];

    try {
      for (const destination of destinations) {
        const sourcePdf = this.storage
          .bucket(this.getBucketName())
          .file(destination.record.object_name);
        const destinationPdf = this.storage
          .bucket(this.getBucketName())
          .file(destination.objectName);
        await sourcePdf.copy(destinationPdf);
        createdPdfFiles.push(destinationPdf);
        await destinationPdf.setMetadata({ metadata: destination.metadata });

        const sourceThumbnail = this.storage
          .bucket(this.getPublicAssetBucketName())
          .file(
            this.createCatalogThumbnailObjectName(
              sourceSlug,
              destination.record.category_slug,
              destination.record.original_file_name,
            ),
          );
        const destinationThumbnail = this.storage
          .bucket(this.getPublicAssetBucketName())
          .file(destination.thumbnailName);

        if (
          await this.copyObjectIfExists(sourceThumbnail, destinationThumbnail)
        ) {
          createdThumbnailFiles.push(destinationThumbnail);
        }
      }
    } catch (error) {
      await Promise.all(
        [...createdPdfFiles, ...createdThumbnailFiles].map((file) =>
          this.deleteObjectIfExists(file),
        ),
      );
      throw new InternalServerErrorException('Unable to update company', {
        cause: error,
      });
    }

    await Promise.all(
      sourceRecords.flatMap((record) => [
        this.deleteObjectIfExists(
          this.storage.bucket(this.getBucketName()).file(record.object_name),
        ),
        this.deleteObjectIfExists(
          this.storage
            .bucket(this.getPublicAssetBucketName())
            .file(
              this.createCatalogThumbnailObjectName(
                sourceSlug,
                record.category_slug,
                record.original_file_name,
              ),
            ),
        ),
      ]),
    );

    return {
      ok: true,
      previous_company_slug: sourceSlug,
      company_slug: requestedCompany.slug,
      company_name: companyName,
      moved_document_count: sourceRecords.length,
      merged: targetRecords.length > 0,
    };
  }

  async deleteCatalogDocument(documentId: string) {
    const objects = await this.listPdfObjects();
    const record = this.createDocumentRecords(objects).find(
      (item) => item.document_id === documentId,
    );

    if (!record) {
      throw new NotFoundException('Document was not found');
    }

    const thumbnailUrl = this.createCatalogThumbnailUrl(
      record.company_slug,
      record.category_slug,
      record.original_file_name,
    );

    try {
      await Promise.all([
        this.storage
          .bucket(this.getBucketName())
          .file(record.object_name)
          .delete({ ignoreNotFound: true }),
        this.storage
          .bucket(this.getPublicAssetBucketName())
          .file(
            this.createCatalogThumbnailObjectName(
              record.company_slug,
              record.category_slug,
              record.original_file_name,
            ),
          )
          .delete({ ignoreNotFound: true }),
      ]);

      return {
        ok: true,
        document_id: record.document_id,
        object_name: record.object_name,
        thumbnail_url: thumbnailUrl,
      };
    } catch (error) {
      throw new InternalServerErrorException('Unable to delete document', {
        cause: error,
      });
    }
  }

  buildCatalogNavigation(
    objects: CatalogStorageObject[],
  ): CatalogNavigationResponse {
    const companies = new Map<string, CatalogNavigationCompany>();

    for (const record of this.createDocumentRecords(objects)) {
      const company =
        companies.get(record.company_slug) ??
        this.createNavigationCompany(record);

      if (!companies.has(record.company_slug)) {
        companies.set(record.company_slug, company);
      }

      const document = this.toDocumentSummary(record);

      if (record.category_slug) {
        const category =
          company.categories.find(
            (item) => item.category_slug === record.category_slug,
          ) ?? this.createNavigationCategory(record);

        if (!company.categories.includes(category)) {
          company.categories.push(category);
        }
        category.documents.push(document);
      } else {
        company.documents.push(document);
      }

      company.document_count += 1;
    }

    return {
      companies: [...companies.values()]
        .map((company) => ({
          ...company,
          categories: company.categories
            .map((category) => ({
              ...category,
              documents: this.sortDocumentSummaries(category.documents),
            }))
            .sort((left, right) =>
              left.category_name.localeCompare(right.category_name),
            ),
          documents: this.sortDocumentSummaries(company.documents),
        }))
        .sort((left, right) =>
          left.company_name.localeCompare(right.company_name),
        ),
    };
  }

  formatLabel(value: string): string {
    return formatCatalogLabel(value);
  }

  slugifyName(value: string): string {
    return slugifyCatalogName(value);
  }

  private createDocumentRecords(
    objects: CatalogStorageObject[],
  ): CatalogDocumentRecord[] {
    return objects
      .map((object) => this.createDocumentRecord(object))
      .filter((record): record is CatalogDocumentRecord => record !== null)
      .sort((left, right) => left.object_name.localeCompare(right.object_name));
  }

  private createDocumentRecord(
    object: CatalogStorageObject,
  ): CatalogDocumentRecord | null {
    if (!this.isCatalogPdf(object.name)) {
      return null;
    }

    const relativeName = this.stripConfiguredPrefix(object.name);
    const parts = relativeName.split('/').filter(Boolean);

    if (parts.length !== 2 && parts.length !== 3) {
      return null;
    }

    const [companyFolder] = parts;
    const categoryFolder = parts.length === 3 ? parts[1] : undefined;
    const fileName = parts[parts.length - 1];
    const companySlug = this.getCustomMetadata(object, 'company_slug');
    const companyName = this.getCustomMetadata(object, 'company_name');
    const categorySlug = this.getCustomMetadata(object, 'category_slug');
    const categoryName = this.getCustomMetadata(object, 'category_name');
    const documentSlug = this.getCustomMetadata(object, 'document_slug');
    const documentName = this.getCustomMetadata(object, 'document_name');
    const documentId = this.getCustomMetadata(object, 'document_id');
    const originalFileName =
      this.getCustomMetadata(object, 'original_file_name') ?? fileName;

    if (
      !companySlug ||
      !companyName ||
      !documentSlug ||
      !documentName ||
      !documentId ||
      companyFolder !== companySlug ||
      slugifyCatalogName(companyName) !== companySlug ||
      slugifyCatalogName(documentName) !== documentSlug
    ) {
      return null;
    }

    if (
      (categoryFolder &&
        (!categorySlug ||
          !categoryName ||
          categoryFolder !== categorySlug ||
          slugifyCatalogName(categoryName) !== categorySlug)) ||
      (!categoryFolder && (categorySlug || categoryName))
    ) {
      return null;
    }

    return {
      document_id: documentId,
      company_slug: companySlug,
      company_name: companyName,
      category_slug: categorySlug,
      category_name: categoryName,
      document_slug: documentSlug,
      document_name: documentName,
      thumbnail_url: this.createCatalogThumbnailUrl(
        companySlug,
        categorySlug,
        originalFileName,
      ),
      metadata: this.createMetadata(object),
      object_name: object.name,
      relative_name: relativeName,
      original_file_name: originalFileName,
      uploaded_at: this.getCustomMetadata(object, 'uploaded_at'),
    };
  }

  private findCanonicalCompany(
    records: CatalogDocumentRecord[],
    companySlug: string,
  ): CatalogDocumentRecord | undefined {
    return records.find((record) => record.company_slug === companySlug);
  }

  private findCanonicalCategory(
    records: CatalogDocumentRecord[],
    companySlug: string,
    categorySlug: string,
  ): CatalogDocumentRecord | undefined {
    return records.find(
      (record) =>
        record.company_slug === companySlug &&
        record.category_slug === categorySlug,
    );
  }

  private async findDocumentBySelection(
    selection: CatalogDocumentSelection,
  ): Promise<DocumentLookup | null> {
    const companySlug = slugifyCatalogName(selection.company_slug);
    const documentSlug = slugifyCatalogName(selection.document_slug);
    const categorySlug = selection.category_slug
      ? slugifyCatalogName(selection.category_slug)
      : undefined;

    if (!companySlug || !documentSlug) {
      return null;
    }

    const objects = await this.listPdfObjects();
    const match = this.createDocumentRecords(objects).find(
      (record) =>
        record.company_slug === companySlug &&
        record.document_slug === documentSlug &&
        record.category_slug === categorySlug,
    );

    if (!match) {
      return null;
    }

    return {
      objectName: match.object_name,
      relativeName: match.relative_name,
      documentId: match.document_id,
    };
  }

  private async listPdfObjects(): Promise<CatalogStorageObject[]> {
    const bucketName = this.getBucketName();
    const prefix = this.getPrefix();

    try {
      const [files] = await this.storage.bucket(bucketName).getFiles({
        prefix,
        autoPaginate: true,
      });

      return files
        .map((file) => {
          const metadata = file.metadata as unknown as GcsObjectMetadata;
          return {
            name: file.name,
            size: metadata.size,
            contentType: metadata.contentType,
            createdAt: metadata.timeCreated,
            updatedAt: metadata.updated,
            customMetadata: metadata.metadata,
          };
        })
        .filter((object) => this.isCatalogPdf(object.name));
    } catch (error) {
      this.logger.error(
        `Unable to load catalog from GCS bucket="${bucketName}" prefix="${prefix}"`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException('Unable to load catalog from GCS', {
        cause: error,
      });
    }
  }

  private async savePdfObject(
    file: GcsFile,
    pdf: Buffer,
    customMetadata: Record<string, string>,
  ): Promise<void> {
    await file.save(pdf, {
      resumable: false,
      metadata: {
        contentType: 'application/pdf',
        cacheControl: 'private, max-age=0, no-transform',
        metadata: customMetadata,
      },
    });
  }

  private async savePublicThumbnail(
    file: GcsFile,
    thumbnail: Buffer,
  ): Promise<void> {
    await file.save(thumbnail, {
      resumable: false,
      metadata: {
        contentType: 'image/webp',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
  }

  private async copyObjectIfExists(
    source: GcsFile,
    destination: GcsFile,
  ): Promise<boolean> {
    const [exists] = await source.exists();
    if (!exists) {
      return false;
    }
    await source.copy(destination);
    return true;
  }

  private async assertDestinationAvailable(
    file: GcsFile,
    message: string,
  ): Promise<void> {
    const [exists] = await file.exists();
    if (exists) {
      throw new ConflictException(message);
    }
  }

  private async deleteObjectIfExists(file: GcsFile): Promise<void> {
    try {
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      this.logger.warn(
        `Unable to clean up GCS object ${file.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private async getFileMetadata(file: GcsFile): Promise<GcsObjectMetadata> {
    const [metadata] =
      (await file.getMetadata()) as unknown as GcsObjectMetadata[];
    return metadata ?? {};
  }

  private async generatePdfThumbnail(pdfBuffer: Buffer): Promise<Buffer> {
    try {
      const { pdf } = await import('pdf-to-img');
      const document = await pdf(
        `data:application/pdf;base64,${pdfBuffer.toString('base64')}`,
        { scale: 2 },
      );

      try {
        const firstPage = await document.getPage(1);
        return sharp(Buffer.from(firstPage))
          .resize({
            width: this.getThumbnailWidth(),
            withoutEnlargement: true,
          })
          .webp({
            quality: this.getThumbnailQuality(),
            effort: 4,
          })
          .toBuffer();
      } finally {
        await document.destroy();
      }
    } catch (error) {
      throw new BadRequestException('Unable to generate PDF thumbnail', {
        cause: error,
      });
    }
  }

  private createMetadata(object: CatalogStorageObject): CatalogMetadata {
    const size = this.parseSize(object.size);
    const updatedAt = object.updatedAt ?? object.createdAt;

    return {
      size,
      sizeLabel: size === undefined ? undefined : this.formatSize(size),
      contentType: object.contentType,
      createdAt: object.createdAt,
      updatedAt,
      updatedLabel: updatedAt ? this.formatDate(updatedAt) : undefined,
    };
  }

  private createDocumentRevisionResponse(input: {
    documentId: string;
    objectName: string;
    relativeName: string;
    size: number;
    contentType: string;
    updatedAt?: string;
    companyName: string;
    companySlug: string;
    categoryName?: string;
    categorySlug?: string;
    documentName: string;
    documentSlug: string;
    uploadedFileName: string;
  }): CatalogDocumentRevision {
    return {
      document_id: input.documentId,
      object_name: input.objectName,
      file_name: this.getFileName(input.relativeName),
      size: input.size,
      content_type: input.contentType,
      updated_at: input.updatedAt,
      company_slug: input.companySlug,
      company_name: input.companyName,
      category_slug: input.categorySlug,
      category_name: input.categoryName,
      document_slug: input.documentSlug,
      document_name: input.documentName,
      thumbnail_url: this.createCatalogThumbnailUrl(
        input.companySlug,
        input.categorySlug,
        input.uploadedFileName,
      ),
    };
  }

  private createNavigationCompany(
    record: CatalogDocumentRecord,
  ): CatalogNavigationCompany {
    return {
      company_slug: record.company_slug,
      company_name: record.company_name,
      document_count: 0,
      categories: [],
      documents: [],
    };
  }

  private createNavigationCategory(
    record: CatalogDocumentRecord,
  ): CatalogNavigationCategory {
    return {
      category_slug: record.category_slug ?? '',
      category_name: record.category_name ?? '',
      documents: [],
    };
  }

  private toDocumentSummary(
    record: CatalogDocumentRecord,
  ): CatalogDocumentSummary {
    return {
      document_id: record.document_id,
      company_slug: record.company_slug,
      company_name: record.company_name,
      category_slug: record.category_slug,
      category_name: record.category_name,
      document_slug: record.document_slug,
      document_name: record.document_name,
      thumbnail_url: record.thumbnail_url,
      metadata: record.metadata,
    };
  }

  private getCompanyDocuments(
    company: CatalogNavigationCompany,
  ): CatalogDocumentSummary[] {
    return this.sortDocumentSummaries([
      ...company.documents,
      ...company.categories.flatMap((category) => category.documents),
    ]);
  }

  private sortDocumentSummaries(
    documents: CatalogDocumentSummary[],
  ): CatalogDocumentSummary[] {
    return [...documents].sort((left, right) =>
      left.document_name.localeCompare(right.document_name),
    );
  }

  private stripConfiguredPrefix(name: string): string {
    const normalizedName = this.normalizeObjectName(name);
    const prefix = this.getPrefix();

    if (!prefix) {
      return normalizedName;
    }

    return normalizedName.startsWith(prefix)
      ? normalizedName.slice(prefix.length)
      : normalizedName;
  }

  private isCatalogPdf(name: string): boolean {
    const relativeName = this.stripConfiguredPrefix(name);
    return (
      Boolean(relativeName) &&
      !relativeName.endsWith('/') &&
      /\.pdf$/i.test(relativeName)
    );
  }

  private assertValidPdfUpload(pdf: Buffer, uploadedFileName: string): void {
    if (!uploadedFileName || !/\.pdf$/i.test(uploadedFileName)) {
      throw new BadRequestException('Uploaded file must be a PDF');
    }
    if (pdf.length === 0) {
      throw new BadRequestException('Uploaded PDF is empty');
    }
    if (!pdf.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new BadRequestException('Uploaded file is not a valid PDF');
    }
  }

  private normalizeUploadedPdfFileName(uploadedFileName: string): string {
    const fileName = uploadedFileName
      .split(/[\\/]/)
      .filter(Boolean)
      .pop()
      ?.replace(/\p{Cc}/gu, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!fileName || !/\.pdf$/i.test(fileName)) {
      throw new BadRequestException('Uploaded file must be a PDF');
    }
    return fileName;
  }

  private assertCatalogName(
    value: string,
    fieldName: string,
  ): CatalogNameIdentity {
    const name = normalizeCatalogName(value);
    if (!name) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    const slug = slugifyCatalogName(name);
    if (!slug) {
      throw new BadRequestException(
        `${fieldName} must contain at least one ASCII letter or number`,
      );
    }

    return { name, slug };
  }

  private getBucketName(): string {
    const bucketName = process.env.GCS_CATALOG_BUCKET?.trim();
    if (!bucketName) {
      throw new ServiceUnavailableException('GCS_CATALOG_BUCKET is required');
    }
    return bucketName;
  }

  private getPublicAssetBucketName(): string {
    const bucketName = process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET?.trim();
    if (!bucketName) {
      throw new ServiceUnavailableException(
        'GCS_CATALOG_PUBLIC_ASSET_BUCKET is required for thumbnail upload',
      );
    }
    return bucketName;
  }

  private getPrefix(): string {
    const normalized = this.normalizeObjectName(
      process.env.GCS_CATALOG_PREFIX?.trim() ?? '',
    );
    if (!normalized) {
      return '';
    }
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  private getSignedUrlTtlSeconds(): number {
    const value = Number(process.env.CATALOG_SIGNED_URL_TTL_SECONDS ?? 900);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 900;
  }

  private getPublicAssetBaseUrl(): string | null {
    const configuredBaseUrl = process.env.CATALOG_PUBLIC_ASSET_BASE_URL?.trim();
    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/g, '');
    }

    const publicBucket = process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET?.trim();
    return publicBucket
      ? `https://storage.googleapis.com/${publicBucket}`
      : null;
  }

  private normalizeObjectName(name: string): string {
    return name.replace(/^\/+/, '');
  }

  private createPrivateDocumentObjectName(
    companySlug: string,
    categorySlug: string | undefined,
    uploadedFileName: string,
  ): string {
    const categoryPrefix = categorySlug ? `${categorySlug}/` : '';
    return `${this.getPrefix()}${companySlug}/${categoryPrefix}${uploadedFileName}`;
  }

  private createDocumentCustomMetadata(input: {
    documentId: string;
    companyName: string;
    companySlug: string;
    categoryName?: string;
    categorySlug?: string;
    documentName: string;
    documentSlug: string;
    originalFileName: string;
    uploadedAt?: string;
  }): Record<string, string> {
    return this.removeUndefinedValues({
      document_id: input.documentId,
      company_name: input.companyName,
      company_slug: input.companySlug,
      category_name: input.categoryName,
      category_slug: input.categorySlug,
      document_name: input.documentName,
      document_slug: input.documentSlug,
      original_file_name: input.originalFileName,
      uploaded_at: input.uploadedAt ?? new Date().toISOString(),
    });
  }

  private createDocumentCustomMetadataPatch(
    metadata: Record<string, string>,
  ): Record<string, string | null> {
    return {
      ...metadata,
      category_name: metadata.category_name ?? null,
      category_slug: metadata.category_slug ?? null,
      display_name: null,
    };
  }

  private removeUndefinedValues(
    values: Record<string, string | undefined>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(values).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    );
  }

  private createCatalogThumbnailUrl(
    companySlug: string,
    categorySlug: string | undefined,
    uploadedFileName: string,
  ): string | undefined {
    const baseUrl = this.getPublicAssetBaseUrl();
    if (!baseUrl) {
      return undefined;
    }

    return `${baseUrl}/${this.createCatalogThumbnailObjectName(
      companySlug,
      categorySlug,
      uploadedFileName,
    )
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }

  private createCatalogThumbnailObjectName(
    companySlug: string,
    categorySlug: string | undefined,
    uploadedFileName: string,
  ): string {
    const categoryPrefix = categorySlug ? `${categorySlug}/` : '';
    return `catalog-thumbnails/v1/${companySlug}/${categoryPrefix}${this.getFileBaseName(
      uploadedFileName,
    )}.webp`;
  }

  private getCustomMetadata(
    object: CatalogStorageObject,
    key: string,
  ): string | undefined {
    const value = object.customMetadata?.[key]?.trim();
    return value || undefined;
  }

  private getThumbnailWidth(): number {
    const value = Number(process.env.CATALOG_THUMBNAIL_WIDTH ?? 480);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : 480;
  }

  private getThumbnailQuality(): number {
    const value = Number(process.env.CATALOG_THUMBNAIL_QUALITY ?? 72);
    if (!Number.isFinite(value) || value <= 0) {
      return 72;
    }
    return Math.min(Math.floor(value), 100);
  }

  private getFileName(documentId: string): string {
    const parts = documentId.split('/').filter(Boolean);
    return parts[parts.length - 1] ?? documentId;
  }

  private getFileBaseName(fileName: string): string {
    return this.getFileName(fileName).replace(/\.pdf$/i, '');
  }

  private parseSize(value: string | number | undefined): number | undefined {
    if (value === undefined || value === null) {
      return undefined;
    }
    const size = Number(value);
    return Number.isFinite(size) ? size : undefined;
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes} B`;
    }

    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = bytes / 1024;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(value));
  }

  private escapeQuotedValue(value: string): string {
    return value.replace(/["\\]/g, '');
  }
}
