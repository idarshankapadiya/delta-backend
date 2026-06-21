import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { ulid } from 'ulid';
import {
  CatalogAction,
  CatalogDocumentSummary,
  CatalogLibraryResponse,
  CatalogNavigationCategory,
  CatalogNavigationCompany,
  CatalogNavigationResponse,
  CatalogMetadata,
  CatalogStorageObject,
  CatalogDocumentRevision,
  SignedDocumentAccess,
} from './catalog.types';

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
}

interface CatalogDocumentSelection {
  company_slug: string;
  category_slug?: string;
  document_slug: string;
}

interface CatalogDocumentUploadInput {
  pdf: Buffer;
  uploadedFileName: string;
  companySlug: string;
  categorySlug?: string;
  documentSlug: string;
  displayName?: string;
}

interface CatalogDocumentUpdateInput {
  pdf?: Buffer;
  uploadedFileName?: string;
  categorySlug?: string;
  displayName?: string;
}

interface GcsObjectMetadata {
  size?: string | number;
  contentType?: string;
  timeCreated?: string;
  updated?: string;
  metadata?: Record<string, string>;
}

@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);
  private readonly storage = new Storage();

  async getCatalogAll(): Promise<CatalogNavigationResponse> {
    const objects = await this.listPdfObjects();
    return this.buildCatalogNavigation(objects);
  }

  async getCatalogLibrary(
    companySlugs: string[],
  ): Promise<CatalogLibraryResponse> {
    const requestedSlugs = new Set(
      companySlugs.map((slug) => this.slugify(slug)).filter(Boolean),
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
    const lookup = await this.findDocumentBySelection(selection);
    return Boolean(lookup);
  }

  async createSignedUrlForSelection(
    selection: CatalogDocumentSelection,
    action: CatalogAction,
  ): Promise<SignedDocumentAccess> {
    const lookup = await this.findDocumentBySelection(selection);

    if (!lookup) {
      throw new ServiceUnavailableException('Document is not available');
    }

    return this.createSignedUrlFromLookup(lookup, action);
  }

  private async createSignedUrlFromLookup(
    lookup: DocumentLookup,
    action: CatalogAction,
  ): Promise<SignedDocumentAccess> {
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

    const companySlug = this.assertValidSlug(input.companySlug, 'company_slug');
    const documentSlug = this.assertValidSlug(
      input.documentSlug,
      'document_slug',
    );
    const categorySlug = input.categorySlug
      ? this.assertValidSlug(input.categorySlug, 'category_slug')
      : undefined;
    const displayName = this.normalizeDisplayName(
      input.displayName,
      documentSlug,
    );
    const uploadedFileName = this.normalizeUploadedPdfFileName(
      input.uploadedFileName,
    );
    const duplicateRecord = await this.findDocumentBySlug(
      companySlug,
      documentSlug,
    );

    if (duplicateRecord) {
      throw new ConflictException('Catalog document already exists');
    }

    const objectName = this.createPrivateDocumentObjectName(
      companySlug,
      uploadedFileName,
    );
    const file = this.storage.bucket(this.getBucketName()).file(objectName);
    const [exists] = await file.exists();

    if (exists) {
      throw new ConflictException('Catalog PDF file already exists');
    }

    const documentId = ulid();
    const thumbnail = await this.generatePdfThumbnail(input.pdf);
    const customMetadata = this.createDocumentCustomMetadata({
      documentId,
      companySlug,
      categorySlug,
      documentSlug,
      displayName,
      originalFileName: uploadedFileName,
    });

    try {
      await this.savePdfObject(file, input.pdf, customMetadata);
      await this.savePublicThumbnail(companySlug, uploadedFileName, thumbnail);

      return this.createDocumentRevisionResponse({
        documentId,
        objectName,
        relativeName: this.stripConfiguredPrefix(objectName),
        size: input.pdf.length,
        contentType: 'application/pdf',
      companySlug,
      categorySlug,
      documentSlug,
      displayName,
      uploadedFileName,
    });
    } catch (error) {
      await this.deleteObjectIfExists(file);
      await this.deletePublicThumbnail(companySlug, uploadedFileName);
      throw new InternalServerErrorException('Unable to create document', {
        cause: error,
      });
    }
  }

  async updateCatalogDocument(
    documentId: string,
    input: CatalogDocumentUpdateInput,
  ): Promise<CatalogDocumentRevision> {
    if (
      !input.pdf &&
      input.displayName === undefined &&
      input.categorySlug === undefined
    ) {
      throw new BadRequestException('PDF file or metadata update is required');
    }

    if (input.pdf) {
      if (!input.uploadedFileName) {
        throw new BadRequestException('Uploaded file name is required');
      }

      this.assertValidPdfUpload(input.pdf, input.uploadedFileName);
    }

    const lookup = await this.findDocument(documentId);

    if (!lookup || !lookup.object) {
      throw new NotFoundException('Document was not found');
    }

    const record = this.createDocumentRecord(lookup.object);

    if (!record) {
      throw new NotFoundException('Document was not found');
    }

    const existingFile = this.storage
      .bucket(this.getBucketName())
      .file(lookup.objectName);
    const nextDocumentId = input.pdf ? ulid() : record.document_id;
    const nextUploadedFileName = input.uploadedFileName
      ? this.normalizeUploadedPdfFileName(input.uploadedFileName)
      : record.original_file_name;
    const nextObjectName = input.pdf
      ? this.createPrivateDocumentObjectName(
          record.company_slug,
          nextUploadedFileName,
        )
      : lookup.objectName;
    const categorySlug =
      input.categorySlug === undefined
        ? record.category_slug
        : input.categorySlug
          ? this.assertValidSlug(input.categorySlug, 'category_slug')
          : undefined;
    const displayName =
      input.displayName === undefined
        ? record.display_name
        : this.normalizeDisplayName(input.displayName, record.document_slug);
    const customMetadata = this.createDocumentCustomMetadata({
      documentId: nextDocumentId,
      companySlug: record.company_slug,
      categorySlug,
      documentSlug: record.document_slug,
      displayName,
      originalFileName: nextUploadedFileName,
    });

    if (input.pdf) {
      const thumbnail = await this.generatePdfThumbnail(input.pdf);
      const nextFile = this.storage
        .bucket(this.getBucketName())
        .file(nextObjectName);

      try {
        if (nextObjectName !== lookup.objectName) {
          const [exists] = await nextFile.exists();

          if (exists) {
            throw new ConflictException('Catalog PDF file already exists');
          }
        }

        await this.savePdfObject(nextFile, input.pdf, customMetadata);

        try {
          await this.savePublicThumbnail(
            record.company_slug,
            nextUploadedFileName,
            thumbnail,
          );

          if (nextObjectName !== lookup.objectName) {
            await this.deleteObjectIfExists(existingFile);
          }

          if (nextUploadedFileName !== record.original_file_name) {
            await this.deletePublicThumbnail(
              record.company_slug,
              record.original_file_name,
            );
          }
        } catch (error) {
          await this.deletePublicThumbnail(
            record.company_slug,
            nextUploadedFileName,
          );

          if (nextObjectName !== lookup.objectName) {
            await this.deleteObjectIfExists(nextFile);
          }

          throw error;
        }
      } catch (error) {
        if (error instanceof ConflictException) {
          throw error;
        }

        throw new InternalServerErrorException('Unable to replace document', {
          cause: error,
        });
      }
    } else {
      try {
        await existingFile.setMetadata({
          metadata: customMetadata,
        });
      } catch (error) {
        throw new InternalServerErrorException('Unable to replace document', {
          cause: error,
        });
      }
    }

    const activeFile = this.storage
      .bucket(this.getBucketName())
      .file(nextObjectName);
    const metadata = await this.getFileMetadata(activeFile);

    return this.createDocumentRevisionResponse({
      documentId: nextDocumentId,
      objectName: nextObjectName,
      relativeName: this.stripConfiguredPrefix(nextObjectName),
      size: this.parseSize(metadata.size) ?? input.pdf?.length ?? 0,
      contentType: metadata.contentType ?? 'application/pdf',
      updatedAt: metadata.updated,
      companySlug: record.company_slug,
      categorySlug,
      documentSlug: record.document_slug,
      displayName,
      uploadedFileName: nextUploadedFileName,
    });
  }

  async deleteCatalogDocument(documentId: string) {
    const lookup = await this.findDocument(documentId);

    if (!lookup || !lookup.object) {
      throw new NotFoundException('Document was not found');
    }

    const record = this.createDocumentRecord(lookup.object);

    if (!record) {
      throw new NotFoundException('Document was not found');
    }

    try {
      await this.deleteObjectIfExists(
        this.storage.bucket(this.getBucketName()).file(lookup.objectName),
      );
      await this.deletePublicThumbnail(
        record.company_slug,
        record.original_file_name,
      );

      return {
        ok: true,
        document_id: record.document_id,
        object_name: lookup.objectName,
        thumbnail_url: this.createCatalogThumbnailUrl(
          record.company_slug,
          record.original_file_name,
        ),
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

    for (const object of objects) {
      const record = this.createDocumentRecord(object);

      if (!record) {
        continue;
      }

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
    const withoutPdf = value.replace(/\.pdf$/i, '');
    const normalized = withoutPdf
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalized
      .split(' ')
      .filter(Boolean)
      .map((word) => {
        if (/^[A-Z0-9]{2,}$/.test(word)) {
          return word;
        }

        if (/^[A-Z0-9]+$/.test(word) && word.length <= 4) {
          return word;
        }

        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');
  }

  private createDocumentRecord(
    object: CatalogStorageObject,
  ): CatalogDocumentRecord | null {
    if (!this.isCatalogPdf(object.name)) {
      return null;
    }

    const relativeName = this.stripConfiguredPrefix(object.name);
    const parts = relativeName.split('/').filter(Boolean);

    if (parts.length !== 2) {
      return null;
    }

    const [companyFolder] = parts;
    const fileName = parts[parts.length - 1];

    const companySlug = this.getCustomMetadata(object, 'company_slug');
    const documentSlug = this.getCustomMetadata(object, 'document_slug');
    const categorySlug = this.getCustomMetadata(object, 'category_slug');
    const displayName = this.getCustomMetadata(object, 'display_name');
    const companyName =
      this.getCustomMetadata(object, 'company_name') ??
      this.formatLabel(companySlug ?? companyFolder);
    const categoryName =
      this.getCustomMetadata(object, 'category_name') ??
      (categorySlug ? this.formatLabel(categorySlug) : undefined);
    const documentId = this.getCustomMetadata(object, 'document_id');
    const originalFileName =
      this.getCustomMetadata(object, 'original_file_name') ?? fileName;

    if (!companySlug || !documentSlug || !displayName || !documentId) {
      return null;
    }

    return {
      document_id: documentId,
      company_slug: companySlug,
      company_name: companyName,
      category_slug: categorySlug,
      category_name: categoryName,
      document_slug: documentSlug,
      display_name: displayName,
      thumbnail_url: this.createCatalogThumbnailUrl(
        companySlug,
        originalFileName,
      ),
      metadata: this.createMetadata(object),
      object_name: object.name,
      relative_name: relativeName,
      original_file_name: originalFileName,
    };
  }

  private async findDocument(
    documentId: string,
  ): Promise<DocumentLookup | null> {
    const objects = await this.listPdfObjects();

    const match = objects
      .map((object) => this.createDocumentRecord(object))
      .filter((record): record is CatalogDocumentRecord => record !== null)
      .find((record) => record.document_id === documentId);

    if (!match) {
      return null;
    }

    return {
      objectName: match.object_name,
      relativeName: match.relative_name,
      documentId,
      object: objects.find((object) => object.name === match.object_name),
    };
  }

  private async findDocumentBySlug(
    companySlug: string,
    documentSlug: string,
  ): Promise<CatalogDocumentRecord | null> {
    const objects = await this.listPdfObjects();
    return (
      objects
        .map((object) => this.createDocumentRecord(object))
        .filter((record): record is CatalogDocumentRecord => record !== null)
        .find(
          (record) =>
            record.company_slug === companySlug &&
            record.document_slug === documentSlug,
        ) ?? null
    );
  }

  private async findDocumentBySelection(
    selection: CatalogDocumentSelection,
  ): Promise<DocumentLookup | null> {
    const companySlug = this.slugify(selection.company_slug);
    const documentSlug = this.slugify(selection.document_slug);
    const categorySlug = selection.category_slug
      ? this.slugify(selection.category_slug)
      : undefined;

    if (!companySlug || !documentSlug) {
      return null;
    }

    const objects = await this.listPdfObjects();
    const match = objects
      .map((object) => this.createDocumentRecord(object))
      .filter((record): record is CatalogDocumentRecord => record !== null)
      .find(
        (record) =>
          record.company_slug === companySlug &&
          record.document_slug === documentSlug &&
          (!categorySlug || record.category_slug === categorySlug),
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
    file: ReturnType<ReturnType<Storage['bucket']>['file']>,
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
    companySlug: string,
    documentSlug: string,
    thumbnail: Buffer,
  ): Promise<void> {
    await this.storage
      .bucket(this.getPublicAssetBucketName())
      .file(this.createCatalogThumbnailObjectName(companySlug, documentSlug))
      .save(thumbnail, {
        resumable: false,
        metadata: {
          contentType: 'image/webp',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
  }

  private async deletePublicThumbnail(
    companySlug: string,
    documentSlug: string,
  ): Promise<void> {
    await this.deleteObjectIfExists(
      this.storage
        .bucket(this.getPublicAssetBucketName())
        .file(this.createCatalogThumbnailObjectName(companySlug, documentSlug)),
    );
  }

  private async deleteObjectIfExists(
    file: ReturnType<ReturnType<Storage['bucket']>['file']>,
  ): Promise<void> {
    try {
      await file.delete({ ignoreNotFound: true });
    } catch {
      // Best-effort cleanup only.
    }
  }

  private async getFileMetadata(
    file: ReturnType<ReturnType<Storage['bucket']>['file']>,
  ): Promise<GcsObjectMetadata> {
    const rawMetadataResult =
      (await file.getMetadata()) as unknown as GcsObjectMetadata[];
    return rawMetadataResult[0] ?? {};
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
    companySlug: string;
    categorySlug?: string;
    documentSlug: string;
    displayName: string;
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
      category_slug: input.categorySlug,
      document_slug: input.documentSlug,
      display_name: input.displayName,
      thumbnail_url: this.createCatalogThumbnailUrl(
        input.companySlug,
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
      display_name: record.display_name,
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
      left.display_name.localeCompare(right.display_name),
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
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!fileName || !/\.pdf$/i.test(fileName)) {
      throw new BadRequestException('Uploaded file must be a PDF');
    }

    return fileName;
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
    const rawPrefix = process.env.GCS_CATALOG_PREFIX?.trim() ?? '';
    const normalized = this.normalizeObjectName(rawPrefix);

    if (!normalized) {
      return '';
    }

    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  }

  private getSignedUrlTtlSeconds(): number {
    const value = Number(process.env.CATALOG_SIGNED_URL_TTL_SECONDS ?? 900);

    if (!Number.isFinite(value) || value <= 0) {
      return 900;
    }

    return Math.floor(value);
  }

  private getPublicAssetBaseUrl(): string | null {
    const configuredBaseUrl = process.env.CATALOG_PUBLIC_ASSET_BASE_URL?.trim();

    if (configuredBaseUrl) {
      return configuredBaseUrl.replace(/\/+$/g, '');
    }

    const publicBucket = process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET?.trim();

    if (publicBucket) {
      return `https://storage.googleapis.com/${publicBucket}`;
    }

    return null;
  }

  private normalizeObjectName(name: string): string {
    return name.replace(/^\/+/, '');
  }

  private createPrivateDocumentObjectName(
    companySlug: string,
    uploadedFileName: string,
  ): string {
    return `${this.getPrefix()}${companySlug}/${uploadedFileName}`;
  }

  private createDocumentCustomMetadata(input: {
    documentId: string;
    companySlug: string;
    categorySlug?: string;
    documentSlug: string;
    displayName: string;
    originalFileName: string;
  }): Record<string, string> {
    return this.removeUndefinedValues({
      document_id: input.documentId,
      company_slug: input.companySlug,
      category_slug: input.categorySlug,
      document_slug: input.documentSlug,
      display_name: input.displayName,
      original_file_name: input.originalFileName,
      uploaded_at: new Date().toISOString(),
    });
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

  private assertValidSlug(value: string, fieldName: string): string {
    const slug = this.slugify(value);

    if (!slug) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return slug;
  }

  private normalizeDisplayName(
    displayName: string | undefined,
    documentSlug: string,
  ): string {
    const normalized = displayName?.replace(/\s+/g, ' ').trim();

    return normalized || this.formatLabel(documentSlug);
  }

  private createCatalogThumbnailUrl(
    companySlug: string,
    uploadedFileName: string,
  ): string | undefined {
    const baseUrl = this.getPublicAssetBaseUrl();

    if (!baseUrl) {
      return undefined;
    }

    return `${baseUrl}/${this.createCatalogThumbnailObjectName(
      companySlug,
      uploadedFileName,
    )
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
  }

  private createCatalogThumbnailObjectName(
    companySlug: string,
    uploadedFileName: string,
  ): string {
    return `catalog-thumbnails/v1/${companySlug}/${this.getFileBaseName(
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

  private slugify(value: string): string {
    return this.formatLabel(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private escapeQuotedValue(value: string): string {
    return value.replace(/["\\]/g, '');
  }
}
