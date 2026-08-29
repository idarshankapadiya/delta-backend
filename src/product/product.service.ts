import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentData,
  FieldPath,
  Firestore,
  Query,
} from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import {
  getProductAssetDelivery,
  getProductBucketName,
  getProductFirestoreDatabaseId,
  getProductPublicAssetBaseUrl,
  getProductSignedUrlTtlSeconds,
} from '../config/product.config';
import {
  ProductCategory,
  ProductCollectionResponse,
  ProductCompany,
  ProductDetail,
  ProductListItem,
  ProductListQuery,
  ProductListResponse,
  ProductSort,
} from './product.types';

interface ProductAssetReference {
  bucket?: string;
  path?: string;
  url?: string;
}

interface ProductCursor {
  fingerprint: string;
  id: string;
  value: string | number;
}

@Injectable()
export class ProductService {
  private readonly logger = new Logger(ProductService.name);
  private firestore?: Firestore;
  private storage?: Storage;

  async getCompanies(): Promise<ProductCollectionResponse<ProductCompany>> {
    const snapshot = await this.getFirestore()
      .collection('companies')
      .where('active', '==', true)
      .orderBy('sortOrder', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .get();

    const data = await Promise.all(
      snapshot.docs.map(async (document) => {
        const record = document.data() as Record<string, unknown>;
        const logoUrl = await this.resolveAsset(
          this.assetReference(record.logo, record.logoPath, record.logoBucket),
        );

        return {
          id: this.stringValue(record.id) || document.id,
          name: this.stringValue(record.name) || document.id,
          slug: this.stringValue(record.slug) || document.id,
          ...(logoUrl ? { logoUrl } : {}),
        };
      }),
    );

    return { data };
  }

  async getCategories(
    companyId?: string,
  ): Promise<ProductCollectionResponse<ProductCategory>> {
    let query: Query<DocumentData, DocumentData> = this.getFirestore()
      .collection('categories')
      .where('active', '==', true);

    if (companyId) {
      query = query.where('companyIds', 'array-contains', companyId);
    }

    const snapshot = await query
      .orderBy('sortOrder', 'asc')
      .orderBy(FieldPath.documentId(), 'asc')
      .get();

    return {
      data: snapshot.docs.map((document) =>
        this.categoryFromRecord(
          document.id,
          document.data() as Record<string, unknown>,
        ),
      ),
    };
  }

  async getProducts(input: ProductListQuery): Promise<ProductListResponse> {
    const search = input.search
      ? this.normalizeSearch(input.search)
      : undefined;
    const sort = this.getSort(input.sort);
    const fingerprint = this.createQueryFingerprint({ ...input, search });
    let query: Query<DocumentData, DocumentData> = this.getFirestore()
      .collection('products')
      .where('active', '==', true);

    if (input.companyId) {
      query = query.where('companyId', '==', input.companyId);
    }
    if (input.categoryId) {
      query = query.where('categoryId', '==', input.categoryId);
    }
    if (input.subcategoryId) {
      query = query.where('subcategoryId', '==', input.subcategoryId);
    }
    if (input.stock) {
      query = query.where('inStock', '==', input.stock === 'in_stock');
    }
    if (search) {
      query = query.where('searchPrefixes', 'array-contains', search);
    }

    query = query
      .orderBy(sort.field, sort.direction)
      .orderBy(FieldPath.documentId(), sort.direction);

    if (input.cursor) {
      const cursor = this.decodeCursor(input.cursor, fingerprint, sort.field);
      query = query.startAfter(cursor.value, cursor.id);
    }

    const snapshot = await query.limit(input.limit + 1).get();
    const hasMore = snapshot.docs.length > input.limit;
    const documents = snapshot.docs.slice(0, input.limit);
    const data = await Promise.all(
      documents.map((document) =>
        this.toProductListItem(
          document.id,
          document.data() as Record<string, unknown>,
        ),
      ),
    );
    const lastDocument = documents.at(-1);
    let nextCursor: string | null = null;

    if (hasMore && lastDocument) {
      const cursorValue = lastDocument.get(sort.field) as unknown;

      if (typeof cursorValue !== 'string' && typeof cursorValue !== 'number') {
        this.logger.error(
          `Product ${lastDocument.id} has an invalid ${sort.field} sort value`,
        );
        throw new BadRequestException('Unable to create pagination cursor');
      }

      nextCursor = this.encodeCursor({
        fingerprint,
        id: lastDocument.id,
        value: cursorValue,
      });
    }

    return {
      data,
      pagination: { nextCursor, hasMore },
    };
  }

  async getProduct(productId: string): Promise<ProductDetail> {
    const document = await this.getFirestore()
      .collection('products')
      .doc(productId)
      .get();

    if (!document.exists) {
      throw new NotFoundException('Product not found');
    }

    const record = document.data() as Record<string, unknown>;

    if (record.active !== true) {
      throw new NotFoundException('Product not found');
    }

    const summary = await this.toProductListItem(document.id, record);
    const mainImageUrl = await this.resolveAsset(
      this.assetReference(
        record.mainImage,
        record.mainImagePath,
        record.mainImageBucket,
      ),
    );
    const brochureUrl = await this.resolveAsset(
      this.assetReference(
        record.brochure,
        record.brochurePath,
        record.brochureBucket,
      ),
    );
    const additionalImageUrls = (
      await Promise.all(
        this.assetReferenceList(record.additionalImages).map((asset) =>
          this.resolveAsset(asset),
        ),
      )
    ).filter((url): url is string => Boolean(url));
    const subcategoryId = this.stringValue(record.subcategoryId);

    return {
      ...summary,
      ...(subcategoryId
        ? {
            subcategory: {
              id: subcategoryId,
              name: this.stringValue(record.subcategoryName) || subcategoryId,
              slug: this.stringValue(record.subcategorySlug) || subcategoryId,
            },
          }
        : {}),
      description: this.stringValue(record.description),
      specifications: this.specificationRecord(record.specifications),
      ...(mainImageUrl ? { mainImageUrl } : {}),
      additionalImageUrls,
      ...(brochureUrl ? { brochureUrl } : {}),
      ...this.catalogRecord(record),
    };
  }

  private async toProductListItem(
    documentId: string,
    record: Record<string, unknown>,
  ): Promise<ProductListItem> {
    const companyId = this.stringValue(record.companyId);
    const categoryId = this.stringValue(record.categoryId);
    const thumbnailUrl = await this.resolveAsset(
      this.assetReference(
        record.thumbnail,
        record.thumbnailPath,
        record.thumbnailBucket,
      ),
    );

    return {
      id: this.stringValue(record.productId) || documentId,
      name: this.stringValue(record.name) || documentId,
      ...this.optionalString('sku', record.sku),
      ...this.optionalString('modelNumber', record.modelNumber),
      company: {
        id: companyId,
        name: this.stringValue(record.companyName) || companyId,
        slug: this.stringValue(record.companySlug) || companyId,
      },
      category: {
        id: categoryId,
        name: this.stringValue(record.categoryName) || categoryId,
        slug: this.stringValue(record.categorySlug) || categoryId,
      },
      price: this.numberValue(record.price),
      currency: this.stringValue(record.currency) || 'INR',
      discountPercentage: this.numberValue(record.discountPercentage),
      inStock: record.inStock === true,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    };
  }

  private categoryFromRecord(
    documentId: string,
    record: Record<string, unknown>,
  ): ProductCategory {
    return {
      id: this.stringValue(record.id) || documentId,
      name: this.stringValue(record.name) || documentId,
      slug: this.stringValue(record.slug) || documentId,
    };
  }

  private getSort(sort: ProductSort): {
    field: 'nameNormalized' | 'price';
    direction: 'asc' | 'desc';
  } {
    switch (sort) {
      case 'name_desc':
        return { field: 'nameNormalized', direction: 'desc' };
      case 'price_asc':
        return { field: 'price', direction: 'asc' };
      case 'price_desc':
        return { field: 'price', direction: 'desc' };
      default:
        return { field: 'nameNormalized', direction: 'asc' };
    }
  }

  private createQueryFingerprint(
    query: ProductListQuery & { search?: string },
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          companyId: query.companyId ?? null,
          categoryId: query.categoryId ?? null,
          subcategoryId: query.subcategoryId ?? null,
          stock: query.stock ?? null,
          search: query.search ?? null,
          sort: query.sort,
        }),
      )
      .digest('base64url')
      .slice(0, 24);
  }

  private encodeCursor(cursor: ProductCursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
  }

  private decodeCursor(
    encoded: string,
    fingerprint: string,
    sortField: string,
  ): ProductCursor {
    try {
      const cursor = JSON.parse(
        Buffer.from(encoded, 'base64url').toString('utf8'),
      ) as Partial<ProductCursor>;
      const expectedValueType = sortField === 'price' ? 'number' : 'string';

      if (
        cursor.fingerprint !== fingerprint ||
        typeof cursor.id !== 'string' ||
        typeof cursor.value !== expectedValueType
      ) {
        throw new Error('Cursor does not match this query');
      }

      return cursor as ProductCursor;
    } catch (error) {
      this.logger.warn(
        `Rejected product cursor: ${error instanceof Error ? error.message : 'invalid value'}`,
      );
      throw new BadRequestException('Invalid or expired product cursor');
    }
  }

  private normalizeSearch(value: string): string | undefined {
    const normalized = value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');

    if (!normalized) {
      throw new BadRequestException('Search cannot be empty');
    }

    return normalized.slice(0, 120);
  }

  private assetReference(
    nested: unknown,
    path: unknown,
    bucket: unknown,
  ): ProductAssetReference | undefined {
    if (typeof nested === 'object' && nested !== null) {
      const record = nested as Record<string, unknown>;
      return {
        bucket: this.stringValue(record.bucket) || undefined,
        path: this.stringValue(record.path) || undefined,
        url: this.stringValue(record.url) || undefined,
      };
    }

    const objectPath = this.stringValue(path);
    return objectPath
      ? { path: objectPath, bucket: this.stringValue(bucket) || undefined }
      : undefined;
  }

  private assetReferenceList(value: unknown): ProductAssetReference[] {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => this.assetReference(item, undefined, undefined))
      .filter((item): item is ProductAssetReference => Boolean(item));
  }

  private async resolveAsset(
    asset?: ProductAssetReference,
  ): Promise<string | undefined> {
    if (!asset) {
      return undefined;
    }

    if (!asset.path) {
      return asset.url && /^https:\/\//i.test(asset.url)
        ? asset.url
        : undefined;
    }

    const bucket = asset.bucket || getProductBucketName();
    const objectPath = asset.path.replace(/^\/+/, '');

    if (getProductAssetDelivery() === 'signed') {
      const [url] = await this.getStorage()
        .bucket(bucket)
        .file(objectPath)
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: Date.now() + getProductSignedUrlTtlSeconds() * 1000,
        });
      return url;
    }

    const encodedPath = objectPath
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    return `${getProductPublicAssetBaseUrl(bucket)}/${encodedPath}`;
  }

  private specificationRecord(
    value: unknown,
  ): Record<string, string | number | boolean | null> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(
        (entry): entry is [string, string | number | boolean | null] =>
          entry[1] === null ||
          ['string', 'number', 'boolean'].includes(typeof entry[1]),
      ),
    );
  }

  private catalogRecord(
    record: Record<string, unknown>,
  ): Pick<ProductDetail, 'catalog'> | Record<string, never> {
    const id = this.stringValue(record.catalogId);
    const name = this.stringValue(record.catalogName);
    const page = record.catalogPage;
    const sourceFile = this.stringValue(record.sourceFile);

    if (!id && !name && page === undefined && !sourceFile) {
      return {};
    }

    return {
      catalog: {
        ...(id ? { id } : {}),
        ...(name ? { name } : {}),
        ...(typeof page === 'string' || typeof page === 'number'
          ? { page }
          : {}),
        ...(sourceFile ? { sourceFile } : {}),
      },
    };
  }

  private optionalString<Key extends string>(
    key: Key,
    value: unknown,
  ): { [Property in Key]?: string } {
    const string = this.stringValue(value);
    return string ? ({ [key]: string } as { [Property in Key]?: string }) : {};
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private getFirestore(): Firestore {
    if (!this.firestore) {
      this.firestore = new Firestore({
        databaseId: getProductFirestoreDatabaseId(),
      });
    }

    return this.firestore;
  }

  private getStorage(): Storage {
    if (!this.storage) {
      this.storage = new Storage();
    }

    return this.storage;
  }
}
