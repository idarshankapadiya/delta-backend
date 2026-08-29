import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentData,
  FieldPath,
  FieldValue,
  Firestore,
  Query,
  QueryDocumentSnapshot,
} from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import {
  getProductBucketName,
  getProductFirestoreDatabaseId,
} from '../config/product.config';
import {
  CreateProductCategoryDto,
  CreateProductCompanyDto,
  CreateProductDto,
  UpdateProductCategoryDto,
  UpdateProductCompanyDto,
  UpdateProductDto,
} from './dto/product-mutation.dto';

type FirestoreRecord = Record<string, unknown>;

@Injectable()
export class ProductMutationService {
  private readonly logger = new Logger(ProductMutationService.name);
  private firestore?: Firestore;
  private storage?: Storage;

  async createCompany(input: CreateProductCompanyDto) {
    const company = {
      id: input.id,
      name: input.name.trim(),
      slug: input.slug?.trim() || input.id,
      ...(input.logoPath ? { logo: this.assetReference(input.logoPath) } : {}),
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await this.createDocument(
      this.getFirestore().collection('companies').doc(input.id),
      company,
      'Company already exists',
    );

    return { ok: true, company: this.publicCompany(company) };
  }

  async updateCompany(companyId: string, input: UpdateProductCompanyDto) {
    this.assertUpdateProvided(input);
    const reference = this.getFirestore()
      .collection('companies')
      .doc(companyId);
    const snapshot = await reference.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Company not found');
    }

    const current = snapshot.data() as FirestoreRecord;
    const update: FirestoreRecord = {
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (input.name !== undefined) update.name = input.name.trim();
    if (input.slug !== undefined) update.slug = input.slug.trim();
    if (input.logoPath !== undefined) {
      update.logo = input.logoPath
        ? this.assetReference(input.logoPath)
        : FieldValue.delete();
    }
    if (input.active !== undefined) update.active = input.active;
    if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;

    await reference.update(update);

    let updatedProducts = 0;
    const productUpdate: FirestoreRecord = {};
    if (input.name !== undefined) productUpdate.companyName = input.name.trim();
    if (input.slug !== undefined) productUpdate.companySlug = input.slug.trim();
    if (Object.keys(productUpdate).length > 0) {
      updatedProducts = await this.propagateProductFields(
        'companyId',
        companyId,
        productUpdate,
      );
    }

    return {
      ok: true,
      company: this.publicCompany({ ...current, ...update, id: companyId }),
      updatedProducts,
    };
  }

  async deleteCompany(companyId: string) {
    const firestore = this.getFirestore();
    const reference = firestore.collection('companies').doc(companyId);

    await firestore.runTransaction(async (transaction) => {
      const [company, products] = await Promise.all([
        transaction.get(reference),
        transaction.get(
          firestore
            .collection('products')
            .where('companyId', '==', companyId)
            .limit(1),
        ),
      ]);

      if (!company.exists) throw new NotFoundException('Company not found');
      if (!products.empty) {
        throw new ConflictException(
          'Delete products belonging to this company before deleting the company',
        );
      }

      transaction.delete(reference);
    });

    const categorySnapshot = await firestore
      .collection('categories')
      .where('companyIds', 'array-contains', companyId)
      .get();
    const writer = firestore.bulkWriter();
    categorySnapshot.docs.forEach((document) => {
      void writer.update(document.ref, {
        companyIds: FieldValue.arrayRemove(companyId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await writer.close();

    return {
      ok: true,
      deletedCompanyId: companyId,
      updatedCategories: categorySnapshot.size,
    };
  }

  async createCategory(input: CreateProductCategoryDto) {
    await this.assertCompaniesExist(input.companyIds);
    const category = {
      id: input.id,
      name: input.name.trim(),
      slug: input.slug?.trim() || input.id,
      companyIds: [...new Set(input.companyIds)],
      active: input.active ?? true,
      sortOrder: input.sortOrder ?? 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await this.createDocument(
      this.getFirestore().collection('categories').doc(input.id),
      category,
      'Category already exists',
    );

    return { ok: true, category: this.publicCategory(category) };
  }

  async updateCategory(categoryId: string, input: UpdateProductCategoryDto) {
    this.assertUpdateProvided(input);
    if (input.companyIds) await this.assertCompaniesExist(input.companyIds);

    const reference = this.getFirestore()
      .collection('categories')
      .doc(categoryId);
    const snapshot = await reference.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Category not found');
    }

    const current = snapshot.data() as FirestoreRecord;
    const update: FirestoreRecord = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (input.name !== undefined) update.name = input.name.trim();
    if (input.slug !== undefined) update.slug = input.slug.trim();
    if (input.companyIds !== undefined) {
      update.companyIds = [...new Set(input.companyIds)];
    }
    if (input.active !== undefined) update.active = input.active;
    if (input.sortOrder !== undefined) update.sortOrder = input.sortOrder;

    await reference.update(update);

    let updatedProducts = 0;
    const productUpdate: FirestoreRecord = {};
    if (input.name !== undefined)
      productUpdate.categoryName = input.name.trim();
    if (input.slug !== undefined)
      productUpdate.categorySlug = input.slug.trim();
    if (Object.keys(productUpdate).length > 0) {
      updatedProducts = await this.propagateProductFields(
        'categoryId',
        categoryId,
        productUpdate,
      );
    }

    return {
      ok: true,
      category: this.publicCategory({ ...current, ...update, id: categoryId }),
      updatedProducts,
    };
  }

  async deleteCategory(categoryId: string) {
    const firestore = this.getFirestore();
    const reference = firestore.collection('categories').doc(categoryId);

    await firestore.runTransaction(async (transaction) => {
      const [category, products] = await Promise.all([
        transaction.get(reference),
        transaction.get(
          firestore
            .collection('products')
            .where('categoryId', '==', categoryId)
            .limit(1),
        ),
      ]);

      if (!category.exists) throw new NotFoundException('Category not found');
      if (!products.empty) {
        throw new ConflictException(
          'Delete products belonging to this category before deleting the category',
        );
      }

      transaction.delete(reference);
    });

    return { ok: true, deletedCategoryId: categoryId };
  }

  async createProduct(input: CreateProductDto) {
    const relationships = await this.getProductRelationships(
      input.companyId,
      input.categoryId,
    );
    const product = this.createProductRecord(input, relationships);

    await this.createDocument(
      this.getFirestore().collection('products').doc(input.productId),
      product,
      'Product already exists',
    );

    return { ok: true, productId: input.productId };
  }

  async updateProduct(productId: string, input: UpdateProductDto) {
    this.assertUpdateProvided(input);
    const reference = this.getFirestore().collection('products').doc(productId);
    const snapshot = await reference.get();

    if (!snapshot.exists) {
      throw new NotFoundException('Product not found');
    }

    const current = snapshot.data() as FirestoreRecord;
    const companyId = input.companyId ?? this.stringValue(current.companyId);
    const categoryId = input.categoryId ?? this.stringValue(current.categoryId);
    const relationships = await this.getProductRelationships(
      companyId,
      categoryId,
    );
    const update = this.createProductUpdate(
      productId,
      input,
      current,
      relationships,
    );

    await reference.update(update);
    return { ok: true, productId, updatedFields: Object.keys(input) };
  }

  deleteProduct(productId: string) {
    return this.deleteProductRecord(productId, false);
  }

  deleteOutOfStockProduct(productId: string) {
    return this.deleteProductRecord(productId, true);
  }

  private async deleteProductRecord(
    productId: string,
    requireOutOfStock: boolean,
  ) {
    const firestore = this.getFirestore();
    const reference = firestore.collection('products').doc(productId);
    const productData = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new NotFoundException('Product not found');

      const data = snapshot.data() as FirestoreRecord;
      if (requireOutOfStock && data.inStock !== false) {
        throw new ConflictException('Product is not out of stock');
      }

      transaction.delete(reference);
      return data;
    });

    const deletedAssets = await this.deleteProductAssets(
      productId,
      productData,
    );
    return { ok: true, deletedProductId: productId, deletedAssets };
  }

  private createProductRecord(
    input: CreateProductDto,
    relationships: {
      company: FirestoreRecord;
      category: FirestoreRecord;
    },
  ): FirestoreRecord {
    this.assertSpecifications(input.specifications);
    this.assertProductAssetPaths(input.productId, input.companyId, input);
    const name = input.name.trim();
    const sku = input.sku?.trim();
    const modelNumber = input.modelNumber?.trim();

    return {
      productId: input.productId,
      name,
      nameNormalized: this.normalize(name),
      ...(sku ? { sku, skuNormalized: this.normalize(sku) } : {}),
      ...(modelNumber
        ? { modelNumber, modelNormalized: this.normalize(modelNumber) }
        : {}),
      searchPrefixes: this.createSearchPrefixes([name, sku, modelNumber]),
      companyId: input.companyId,
      companyName: this.stringValue(relationships.company.name),
      companySlug:
        this.stringValue(relationships.company.slug) || input.companyId,
      categoryId: input.categoryId,
      categoryName: this.stringValue(relationships.category.name),
      categorySlug:
        this.stringValue(relationships.category.slug) || input.categoryId,
      ...this.optionalStringField('subcategoryId', input.subcategoryId),
      ...this.optionalStringField('subcategoryName', input.subcategoryName),
      ...this.optionalStringField('subcategorySlug', input.subcategorySlug),
      price: input.price,
      currency: input.currency || 'INR',
      discountPercentage: input.discountPercentage ?? 0,
      inStock: input.inStock,
      ...(input.stockQuantity !== undefined
        ? { stockQuantity: input.stockQuantity }
        : {}),
      active: input.active ?? true,
      shortDescription: input.shortDescription?.trim() || '',
      description: input.description?.trim() || '',
      specifications: input.specifications ?? {},
      ...this.productAssetFields(input),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  private createProductUpdate(
    productId: string,
    input: UpdateProductDto,
    current: FirestoreRecord,
    relationships: { company: FirestoreRecord; category: FirestoreRecord },
  ): FirestoreRecord {
    this.assertSpecifications(input.specifications);
    const companyId = input.companyId ?? this.stringValue(current.companyId);
    const categoryId = input.categoryId ?? this.stringValue(current.categoryId);
    this.assertProductAssetPaths(productId, companyId, input);
    const update: FirestoreRecord = {
      updatedAt: FieldValue.serverTimestamp(),
      companyId,
      companyName: this.stringValue(relationships.company.name),
      companySlug: this.stringValue(relationships.company.slug) || companyId,
      categoryId,
      categoryName: this.stringValue(relationships.category.name),
      categorySlug: this.stringValue(relationships.category.slug) || categoryId,
    };

    const directFields: Array<keyof UpdateProductDto> = [
      'price',
      'currency',
      'discountPercentage',
      'inStock',
      'stockQuantity',
      'active',
      'specifications',
    ];
    directFields.forEach((field) => {
      if (input[field] !== undefined) update[field] = input[field];
    });

    const stringFields: Array<keyof UpdateProductDto> = [
      'subcategoryId',
      'subcategoryName',
      'subcategorySlug',
      'shortDescription',
      'description',
    ];
    stringFields.forEach((field) => {
      const fieldValue = input[field];
      if (typeof fieldValue === 'string') {
        const value = fieldValue.trim();
        update[field] = value || FieldValue.delete();
      }
    });

    if (
      input.name !== undefined ||
      input.sku !== undefined ||
      input.modelNumber !== undefined
    ) {
      const name = input.name?.trim() || this.stringValue(current.name);
      const sku =
        input.sku !== undefined
          ? input.sku.trim()
          : this.stringValue(current.sku);
      const modelNumber =
        input.modelNumber !== undefined
          ? input.modelNumber.trim()
          : this.stringValue(current.modelNumber);
      update.name = name;
      update.nameNormalized = this.normalize(name);
      update.sku = sku || FieldValue.delete();
      update.skuNormalized = sku ? this.normalize(sku) : FieldValue.delete();
      update.modelNumber = modelNumber || FieldValue.delete();
      update.modelNormalized = modelNumber
        ? this.normalize(modelNumber)
        : FieldValue.delete();
      update.searchPrefixes = this.createSearchPrefixes([
        name,
        sku,
        modelNumber,
      ]);
    }

    Object.assign(update, this.productAssetFields(input, true));
    return update;
  }

  private productAssetFields(
    input: CreateProductDto | UpdateProductDto,
    allowDelete = false,
  ): FirestoreRecord {
    const fields: FirestoreRecord = {};
    const assignAsset = (field: string, path: string | undefined) => {
      if (path === undefined) return;
      fields[field] = path
        ? this.assetReference(path)
        : allowDelete
          ? FieldValue.delete()
          : undefined;
    };

    assignAsset('thumbnail', input.thumbnailPath);
    assignAsset('mainImage', input.mainImagePath);
    assignAsset('brochure', input.brochurePath);
    if (input.additionalImagePaths !== undefined) {
      fields.additionalImages = input.additionalImagePaths.map((path) =>
        this.assetReference(path),
      );
    }
    return Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    );
  }

  private async getProductRelationships(companyId: string, categoryId: string) {
    if (!companyId || !categoryId) {
      throw new BadRequestException('companyId and categoryId are required');
    }

    const firestore = this.getFirestore();
    const [company, category] = await firestore.getAll(
      firestore.collection('companies').doc(companyId),
      firestore.collection('categories').doc(categoryId),
    );
    if (!company.exists)
      throw new BadRequestException('Company does not exist');
    if (!category.exists)
      throw new BadRequestException('Category does not exist');

    const categoryData = category.data() as FirestoreRecord;
    const companyIds = Array.isArray(categoryData.companyIds)
      ? categoryData.companyIds
      : [];
    if (companyIds.length > 0 && !companyIds.includes(companyId)) {
      throw new BadRequestException(
        'Category is not associated with the selected company',
      );
    }

    return {
      company: company.data() as FirestoreRecord,
      category: categoryData,
    };
  }

  private async assertCompaniesExist(companyIds: string[]) {
    const uniqueIds = [...new Set(companyIds)];
    if (uniqueIds.length === 0) return;
    const firestore = this.getFirestore();
    const documents = await firestore.getAll(
      ...uniqueIds.map((id) => firestore.collection('companies').doc(id)),
    );
    const missing = documents
      .filter((document) => !document.exists)
      .map((document) => document.id);
    if (missing.length > 0) {
      throw new BadRequestException(
        `Companies do not exist: ${missing.join(', ')}`,
      );
    }
  }

  private async propagateProductFields(
    field: 'companyId' | 'categoryId',
    value: string,
    update: FirestoreRecord,
  ): Promise<number> {
    const firestore = this.getFirestore();
    let lastDocument:
      | QueryDocumentSnapshot<DocumentData, DocumentData>
      | undefined;
    let updated = 0;

    do {
      let query: Query<DocumentData, DocumentData> = firestore
        .collection('products')
        .where(field, '==', value)
        .orderBy(FieldPath.documentId())
        .limit(400);
      if (lastDocument) query = query.startAfter(lastDocument);
      const snapshot = await query.get();
      if (snapshot.empty) break;

      const writer = firestore.bulkWriter();
      snapshot.docs.forEach((document) => {
        void writer.update(document.ref, {
          ...update,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await writer.close();
      updated += snapshot.size;
      lastDocument = snapshot.docs.at(-1);
      if (snapshot.size < 400) break;
    } while (lastDocument);

    return updated;
  }

  private async deleteProductAssets(
    productId: string,
    data: FirestoreRecord,
  ): Promise<number> {
    const companyId = this.stringValue(data.companyId);
    const expectedPrefix = `products/${companyId}/${productId}/`;
    const assets = [
      data.thumbnail,
      data.mainImage,
      data.brochure,
      ...(Array.isArray(data.additionalImages)
        ? (data.additionalImages as unknown[])
        : []),
    ];
    const references = assets
      .map((asset) => this.storedAssetReference(asset))
      .filter((asset): asset is { bucket: string; path: string } =>
        Boolean(
          asset?.bucket === getProductBucketName() &&
          asset.path.startsWith(expectedPrefix),
        ),
      );

    let deleted = 0;
    await Promise.all(
      references.map(async (asset) => {
        try {
          await this.getStorage()
            .bucket(asset.bucket)
            .file(asset.path)
            .delete({ ignoreNotFound: true });
          deleted += 1;
        } catch (error) {
          this.logger.error(
            `Unable to clean product asset ${asset.bucket}/${asset.path}`,
            error instanceof Error ? error.stack : undefined,
          );
        }
      }),
    );
    return deleted;
  }

  private assertProductAssetPaths(
    productId: string,
    companyId: string,
    input: CreateProductDto | UpdateProductDto,
  ) {
    const prefix = `products/${companyId}/${productId}/`;
    const paths = [
      input.thumbnailPath,
      input.mainImagePath,
      input.brochurePath,
      ...(input.additionalImagePaths ?? []),
    ].filter(Boolean) as string[];
    if (paths.some((path) => !path.startsWith(prefix))) {
      throw new BadRequestException(
        `Product asset paths must start with ${prefix}`,
      );
    }
  }

  private assertSpecifications(value: unknown) {
    if (value === undefined) return;
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > 500) {
      throw new BadRequestException(
        'A product can have at most 500 specifications',
      );
    }
    if (
      entries.some(
        ([key, item]) =>
          !key.trim() ||
          key.length > 160 ||
          !(
            item === null ||
            typeof item === 'string' ||
            typeof item === 'number' ||
            typeof item === 'boolean'
          ),
      )
    ) {
      throw new BadRequestException(
        'Specifications must contain primitive values and non-empty keys',
      );
    }
  }

  private assertUpdateProvided(input: object) {
    if (Object.keys(input).length === 0) {
      throw new BadRequestException('At least one update field is required');
    }
  }

  private async createDocument(
    reference: FirebaseFirestore.DocumentReference,
    data: FirestoreRecord,
    conflictMessage: string,
  ) {
    try {
      await reference.create(data);
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        ((error as { code?: unknown }).code === 6 ||
          (error as { code?: unknown }).code === 'ALREADY_EXISTS')
      ) {
        throw new ConflictException(conflictMessage);
      }
      throw error;
    }
  }

  private assetReference(path: string) {
    return { bucket: getProductBucketName(), path: path.replace(/^\/+/, '') };
  }

  private storedAssetReference(value: unknown) {
    if (typeof value !== 'object' || value === null) return undefined;
    const record = value as FirestoreRecord;
    const path = this.stringValue(record.path);
    if (!path) return undefined;
    return {
      bucket: this.stringValue(record.bucket) || getProductBucketName(),
      path,
    };
  }

  private publicCompany(value: FirestoreRecord) {
    return {
      id: this.stringValue(value.id),
      name: this.stringValue(value.name),
      slug: this.stringValue(value.slug),
      active: value.active === true,
      sortOrder: this.numberValue(value.sortOrder),
    };
  }

  private publicCategory(value: FirestoreRecord) {
    return {
      id: this.stringValue(value.id),
      name: this.stringValue(value.name),
      slug: this.stringValue(value.slug),
      companyIds: Array.isArray(value.companyIds) ? value.companyIds : [],
      active: value.active === true,
      sortOrder: this.numberValue(value.sortOrder),
    };
  }

  private createSearchPrefixes(values: Array<string | undefined>) {
    const prefixes = new Set<string>();
    values.filter(Boolean).forEach((value) => {
      const normalized = this.normalize(value as string).slice(0, 120);
      for (let index = 1; index <= normalized.length; index += 1) {
        prefixes.add(normalized.slice(0, index));
      }
    });
    return [...prefixes];
  }

  private normalize(value: string) {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  private optionalStringField(key: string, value?: string) {
    return value?.trim() ? { [key]: value.trim() } : {};
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
  }

  private numberValue(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private getFirestore() {
    if (!this.firestore) {
      this.firestore = new Firestore({
        databaseId: getProductFirestoreDatabaseId(),
      });
    }
    return this.firestore;
  }

  private getStorage() {
    if (!this.storage) this.storage = new Storage();
    return this.storage;
  }
}
