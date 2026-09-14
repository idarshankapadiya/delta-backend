import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
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
import { ulid } from 'ulid';
import {
  getProductBucketName,
  getProductFirestoreDatabaseId,
  getProductThumbnailBucketName,
} from '../config/product.config';
import {
  CreateProductCategoryDto,
  CreateProductCompanyDto,
  CreateProductDto,
  UpdateProductCategoryDto,
  UpdateProductCompanyDto,
  UpdateProductDto,
} from './dto/product-mutation.dto';
import type {
  ProductAssetReference,
  ProductUploadFile,
  ProductUploadFiles,
  UploadedProductAssets,
} from './product-upload.types';

type FirestoreRecord = Record<string, unknown>;
type ResolvedCreateProductInput = CreateProductDto & {
  productId: string;
  companyId: string;
  categoryId: string;
};

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

  async createProduct(input: CreateProductDto, files?: ProductUploadFiles) {
    const productId = this.resourceIdFromName(input.name, 'Product');
    const companyId = input.isNewCompany
      ? this.resourceIdFromName(input.companyName, 'Company')
      : this.requiredResourceId(input.companyId, 'companyId');
    const categoryId = input.isNewCategory
      ? this.resourceIdFromName(input.categoryName, 'Category')
      : this.requiredResourceId(input.categoryId, 'categoryId');
    const firestore = this.getFirestore();
    const productReference = firestore.collection('products').doc(productId);
    const companyReference = firestore.collection('companies').doc(companyId);
    const categoryReference = firestore
      .collection('categories')
      .doc(categoryId);

    const uploadedAssets = this.hasProductUploadFiles(files)
      ? await this.uploadProductAssets(productId, companyId, files)
      : undefined;

    try {
      await firestore.runTransaction(async (transaction) => {
        const [productSnapshot, companySnapshot, categorySnapshot] =
          await Promise.all([
            transaction.get(productReference),
            transaction.get(companyReference),
            transaction.get(categoryReference),
          ]);

        if (productSnapshot.exists) {
          throw new ConflictException('Product already exists');
        }

        let company: FirestoreRecord;
        if (input.isNewCompany) {
          if (companySnapshot.exists) {
            throw new ConflictException('Company already exists');
          }
          company = this.newCompanyRecord(
            companyId,
            input.companyName as string,
          );
          transaction.create(companyReference, company);
        } else {
          if (!companySnapshot.exists) {
            throw new BadRequestException('Company does not exist');
          }
          company = companySnapshot.data() as FirestoreRecord;
        }

        let category: FirestoreRecord;
        if (input.isNewCategory) {
          if (categorySnapshot.exists) {
            throw new ConflictException('Category already exists');
          }
          category = this.newCategoryRecord(
            categoryId,
            input.categoryName as string,
            companyId,
          );
          transaction.create(categoryReference, category);
        } else {
          if (!categorySnapshot.exists) {
            throw new BadRequestException('Category does not exist');
          }
          category = categorySnapshot.data() as FirestoreRecord;
          this.assertCategoryCompany(category, companyId);
        }

        const productInput: ResolvedCreateProductInput = {
          ...input,
          productId,
          companyId,
          categoryId,
        };
        const product = this.createProductRecord(
          productInput,
          {
            company,
            category,
          },
          uploadedAssets,
        );
        transaction.create(productReference, product);
      });
    } catch (error) {
      await this.deleteUploadedAssets(uploadedAssets);
      throw error;
    }

    return { ok: true, productId };
  }

  async updateProduct(
    productId: string,
    input: UpdateProductDto,
    files?: ProductUploadFiles,
  ) {
    if (Object.keys(input).length === 0 && !this.hasProductUploadFiles(files)) {
      throw new BadRequestException('At least one update field is required');
    }
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
    const uploadedAssets = this.hasProductUploadFiles(files)
      ? await this.uploadProductAssets(productId, companyId, files)
      : undefined;
    const update = this.createProductUpdate(
      productId,
      input,
      current,
      relationships,
    );
    Object.assign(update, this.uploadedAssetFields(uploadedAssets));

    try {
      await reference.update(update);
    } catch (error) {
      await this.deleteUploadedAssets(uploadedAssets);
      throw error;
    }

    await this.deleteReplacedAssets(productId, current, uploadedAssets);
    return {
      ok: true,
      productId,
      updatedFields: [
        ...Object.keys(input),
        ...this.uploadedAssetFieldNames(uploadedAssets),
      ],
    };
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
    const deletion = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(reference);
      if (!snapshot.exists) throw new NotFoundException('Product not found');

      const data = snapshot.data() as FirestoreRecord;
      if (requireOutOfStock && data.inStock !== false) {
        throw new ConflictException('Product is not out of stock');
      }

      const companyId = this.stringValue(data.companyId);
      const categoryId = this.stringValue(data.categoryId);
      const companyReference = companyId
        ? firestore.collection('companies').doc(companyId)
        : undefined;
      const categoryReference = categoryId
        ? firestore.collection('categories').doc(categoryId)
        : undefined;
      const [companyProducts, categoryProducts, company, category] =
        await Promise.all([
          companyId
            ? transaction.get(
                firestore
                  .collection('products')
                  .where('companyId', '==', companyId)
                  .limit(2),
              )
            : undefined,
          categoryId
            ? transaction.get(
                firestore
                  .collection('products')
                  .where('categoryId', '==', categoryId)
                  .limit(2),
              )
            : undefined,
          companyReference ? transaction.get(companyReference) : undefined,
          categoryReference ? transaction.get(categoryReference) : undefined,
        ]);
      const deleteCompany = Boolean(
        companyReference &&
        company?.exists &&
        companyProducts?.docs.every((document) => document.id === productId),
      );
      const deleteCategory = Boolean(
        categoryReference &&
        category?.exists &&
        categoryProducts?.docs.every((document) => document.id === productId),
      );
      const linkedCategories = deleteCompany
        ? await transaction.get(
            firestore
              .collection('categories')
              .where('companyIds', 'array-contains', companyId),
          )
        : undefined;

      transaction.delete(reference);
      if (deleteCompany && companyReference) {
        transaction.delete(companyReference);
      }
      if (deleteCategory && categoryReference) {
        transaction.delete(categoryReference);
      }

      let updatedCategories = 0;
      linkedCategories?.docs.forEach((document) => {
        if (deleteCategory && document.id === categoryId) return;
        transaction.update(document.ref, {
          companyIds: FieldValue.arrayRemove(companyId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        updatedCategories += 1;
      });

      return {
        data,
        deletedCompanyId: deleteCompany ? companyId : null,
        deletedCategoryId: deleteCategory ? categoryId : null,
        updatedCategories,
      };
    });

    const deletedAssets = await this.deleteProductAssets(
      productId,
      deletion.data,
    );
    return {
      ok: true,
      deletedProductId: productId,
      deletedAssets,
      deletedCompanyId: deletion.deletedCompanyId,
      deletedCategoryId: deletion.deletedCategoryId,
      updatedCategories: deletion.updatedCategories,
    };
  }

  private newCompanyRecord(id: string, name: string): FirestoreRecord {
    return {
      id,
      name: name.trim(),
      slug: id,
      active: true,
      sortOrder: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  private newCategoryRecord(
    id: string,
    name: string,
    companyId: string,
  ): FirestoreRecord {
    return {
      id,
      name: name.trim(),
      slug: id,
      companyIds: [companyId],
      active: true,
      sortOrder: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
  }

  private createProductRecord(
    input: ResolvedCreateProductInput,
    relationships: {
      company: FirestoreRecord;
      category: FirestoreRecord;
    },
    uploadedAssets?: UploadedProductAssets,
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
      ...this.uploadedAssetFields(uploadedAssets),
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

  private uploadedAssetFields(assets?: UploadedProductAssets): FirestoreRecord {
    if (!assets) return {};

    return {
      ...(assets.thumbnail ? { thumbnail: assets.thumbnail } : {}),
      ...(assets.mainImage ? { mainImage: assets.mainImage } : {}),
      ...(assets.brochure ? { brochure: assets.brochure } : {}),
      ...(assets.additionalImages
        ? { additionalImages: assets.additionalImages }
        : {}),
    };
  }

  private uploadedAssetFieldNames(assets?: UploadedProductAssets): string[] {
    if (!assets) return [];
    return [
      ...(assets.thumbnail ? ['thumbnail'] : []),
      ...(assets.mainImage ? ['mainImage'] : []),
      ...(assets.additionalImages ? ['additionalImages'] : []),
      ...(assets.brochure ? ['brochure'] : []),
    ];
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
    this.assertCategoryCompany(categoryData, companyId);

    return {
      company: company.data() as FirestoreRecord,
      category: categoryData,
    };
  }

  private assertCategoryCompany(category: FirestoreRecord, companyId: string) {
    const companyIds = Array.isArray(category.companyIds)
      ? category.companyIds
      : [];
    if (companyIds.length > 0 && !companyIds.includes(companyId)) {
      throw new BadRequestException(
        'Category is not associated with the selected company',
      );
    }
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

  private async uploadProductAssets(
    productId: string,
    companyId: string,
    files: ProductUploadFiles,
  ): Promise<UploadedProductAssets> {
    const uploadId = ulid().toLowerCase();
    const productPrefix = `products/${companyId}/${productId}`;
    const thumbnailPrefix = `product-thumbnails/v1/${companyId}/${productId}`;
    const destinations: Array<{
      assign: (reference: ProductAssetReference) => void;
      bucket: string;
      file: ProductUploadFile;
      path: string;
    }> = [];
    const assets: UploadedProductAssets = {};

    if (files.thumbnail) {
      destinations.push({
        assign: (reference) => {
          assets.thumbnail = reference;
        },
        bucket: getProductThumbnailBucketName(),
        file: files.thumbnail,
        path: `${thumbnailPrefix}/thumbnail-${uploadId}.webp`,
      });
    }
    if (files.mainImage) {
      destinations.push({
        assign: (reference) => {
          assets.mainImage = reference;
        },
        bucket: getProductBucketName(),
        file: files.mainImage,
        path: `${productPrefix}/main-${uploadId}.${files.mainImage.extension}`,
      });
    }
    if (files.additionalImages?.length) {
      const additionalImages: ProductAssetReference[] = [];
      assets.additionalImages = additionalImages;
      files.additionalImages.forEach((file, index) => {
        destinations.push({
          assign: (reference) => {
            additionalImages.push(reference);
          },
          bucket: getProductBucketName(),
          file,
          path: `${productPrefix}/additional-${index + 1}-${uploadId}.${file.extension}`,
        });
      });
    }
    if (files.brochure) {
      destinations.push({
        assign: (reference) => {
          assets.brochure = reference;
        },
        bucket: getProductBucketName(),
        file: files.brochure,
        path: `${productPrefix}/brochure-${uploadId}.pdf`,
      });
    }

    const uploaded: ProductAssetReference[] = [];
    try {
      for (const destination of destinations) {
        const reference = {
          bucket: destination.bucket,
          path: destination.path,
        };
        await this.getStorage()
          .bucket(reference.bucket)
          .file(reference.path)
          .save(destination.file.buffer, {
            resumable: false,
            validation: 'crc32c',
            metadata: {
              cacheControl: 'public, max-age=31536000, immutable',
              contentType: destination.file.contentType,
              metadata: {
                originalFileName: destination.file.filename,
              },
            },
          });
        uploaded.push(reference);
        destination.assign(reference);
      }
    } catch (error) {
      await this.deleteAssetReferences(uploaded);
      throw new InternalServerErrorException(
        'Unable to upload product assets',
        {
          cause: error,
        },
      );
    }

    return assets;
  }

  private async deleteReplacedAssets(
    productId: string,
    current: FirestoreRecord,
    replacements?: UploadedProductAssets,
  ): Promise<void> {
    if (!replacements) return;

    const companyId = this.stringValue(current.companyId);
    const replaced = [
      ...(replacements.thumbnail ? [current.thumbnail] : []),
      ...(replacements.mainImage ? [current.mainImage] : []),
      ...(replacements.brochure ? [current.brochure] : []),
      ...(replacements.additionalImages &&
      Array.isArray(current.additionalImages)
        ? (current.additionalImages as unknown[])
        : []),
    ]
      .map((asset) => this.storedAssetReference(asset))
      .filter((asset): asset is ProductAssetReference =>
        Boolean(asset && this.isOwnedProductAsset(asset, companyId, productId)),
      );

    await this.deleteAssetReferences(replaced);
  }

  private async deleteUploadedAssets(
    assets?: UploadedProductAssets,
  ): Promise<void> {
    if (!assets) return;
    await this.deleteAssetReferences(
      [
        assets.thumbnail,
        assets.mainImage,
        assets.brochure,
        ...(assets.additionalImages ?? []),
      ].filter((asset): asset is ProductAssetReference => Boolean(asset)),
    );
  }

  private async deleteAssetReferences(
    assets: ProductAssetReference[],
  ): Promise<number> {
    let deleted = 0;
    await Promise.all(
      assets.map(async (asset) => {
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

  private async deleteProductAssets(
    productId: string,
    data: FirestoreRecord,
  ): Promise<number> {
    const companyId = this.stringValue(data.companyId);
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
      .filter((asset): asset is ProductAssetReference =>
        Boolean(asset && this.isOwnedProductAsset(asset, companyId, productId)),
      );

    return this.deleteAssetReferences(references);
  }

  private isOwnedProductAsset(
    asset: ProductAssetReference,
    companyId: string,
    productId: string,
  ): boolean {
    const productPrefix = `products/${companyId}/${productId}/`;
    const thumbnailPrefix = `product-thumbnails/v1/${companyId}/${productId}/`;
    return (
      (asset.bucket === getProductBucketName() &&
        asset.path.startsWith(productPrefix)) ||
      (asset.bucket === getProductThumbnailBucketName() &&
        asset.path.startsWith(thumbnailPrefix))
    );
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

  private hasProductUploadFiles(
    files?: ProductUploadFiles,
  ): files is ProductUploadFiles {
    return Boolean(
      files?.thumbnail ||
      files?.mainImage ||
      files?.brochure ||
      files?.additionalImages?.length,
    );
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

  private resourceIdFromName(value: string | undefined, label: string) {
    const id = String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 128)
      .replace(/-+$/g, '');
    if (!id) {
      throw new BadRequestException(
        `${label} name must contain at least one letter or number`,
      );
    }
    return id;
  }

  private requiredResourceId(value: string | undefined, field: string) {
    const id = this.stringValue(value);
    if (!id) throw new BadRequestException(`${field} is required`);
    return id;
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
