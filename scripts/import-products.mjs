import { Firestore, FieldValue } from '@google-cloud/firestore';
import { Storage } from '@google-cloud/storage';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (argument.startsWith('--')) {
    const [key, inlineValue] = argument.slice(2).split('=', 2);
    const nextValue = process.argv[index + 1];
    const value =
      inlineValue ??
      (nextValue && !nextValue.startsWith('--') ? nextValue : true);
    args.set(key, value);
    if (inlineValue === undefined && value !== true) index += 1;
  }
}

const manifestPath = args.get('manifest');
const assetsPath = args.get('assets');
const apply = args.has('apply');

if (typeof manifestPath !== 'string' || typeof assetsPath !== 'string') {
  throw new Error(
    'Usage: npm run products:import -- --manifest ./catalog.json --assets ./assets [--apply]',
  );
}

const absoluteManifestPath = resolve(manifestPath);
const absoluteAssetsPath = resolve(assetsPath);
const manifest = JSON.parse(await readFile(absoluteManifestPath, 'utf8'));
validateManifest(manifest);

const productIds = new Set();
for (const product of manifest.products) {
  assertId(product.productId, 'productId');
  assertId(product.companyId, `companyId for ${product.productId}`);
  assertId(product.categoryId, `categoryId for ${product.productId}`);
  if (productIds.has(product.productId)) {
    throw new Error(`Duplicate productId: ${product.productId}`);
  }
  productIds.add(product.productId);
}

if (!apply) {
  process.stdout.write(
    `${JSON.stringify(
      {
        mode: 'dry-run',
        companies: manifest.companies.length,
        categories: manifest.categories.length,
        products: manifest.products.length,
        next: 'Run the same command with --apply after reviewing this summary.',
      },
      null,
      2,
    )}\n`,
  );
  process.exit(0);
}

const bucketName = process.env.GCS_PRODUCT_BUCKET?.trim();
const databaseId = (
  process.env.PRODUCT_FIRESTORE_DATABASE_ID ?? process.env.FIRESTORE_DATABASE_ID
)?.trim();

if (!bucketName || !databaseId) {
  throw new Error(
    'GCS_PRODUCT_BUCKET and PRODUCT_FIRESTORE_DATABASE_ID (or FIRESTORE_DATABASE_ID) are required with --apply',
  );
}

const storage = new Storage();
const bucket = storage.bucket(bucketName);
const firestore = new Firestore({
  databaseId,
  ignoreUndefinedProperties: true,
});
const companyMap = new Map(
  manifest.companies.map((company) => [company.id, company]),
);
const categoryMap = new Map(
  manifest.categories.map((category) => [category.id, category]),
);

for (const company of manifest.companies) {
  assertId(company.id, 'company id');
  await upsertDocument(firestore.collection('companies').doc(company.id), {
    id: company.id,
    name: requiredString(company.name, `name for company ${company.id}`),
    slug: company.slug || company.id,
    active: company.active !== false,
    sortOrder: finiteNumber(company.sortOrder, 0),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

for (const category of manifest.categories) {
  assertId(category.id, 'category id');
  await upsertDocument(firestore.collection('categories').doc(category.id), {
    id: category.id,
    name: requiredString(category.name, `name for category ${category.id}`),
    slug: category.slug || category.id,
    companyIds: Array.isArray(category.companyIds) ? category.companyIds : [],
    active: category.active !== false,
    sortOrder: finiteNumber(category.sortOrder, 0),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

let importedProducts = 0;
for (const product of manifest.products) {
  const company = companyMap.get(product.companyId);
  const category = categoryMap.get(product.categoryId);
  if (!company || !category) {
    throw new Error(
      `Product ${product.productId} references an unknown company or category`,
    );
  }

  const objectPrefix = `products/${product.companyId}/${product.productId}`;
  const thumbnail = product.assets?.thumbnail
    ? await uploadThumbnail(product, objectPrefix)
    : undefined;
  const mainImage = product.assets?.mainImage
    ? await uploadAsset(product.assets.mainImage, objectPrefix, 'main', {
        allowedExtensions: ['.svg'],
        contentType: 'image/svg+xml',
        product,
        assetType: 'main_image',
      })
    : undefined;
  const additionalImages = [];
  for (const [index, fileName] of (
    product.assets?.additionalImages ?? []
  ).entries()) {
    additionalImages.push(
      await uploadAsset(fileName, objectPrefix, `image-${index + 1}`, {
        allowedExtensions: ['.svg', '.webp', '.png', '.jpg', '.jpeg'],
        contentType: contentTypeFor(fileName),
        product,
        assetType: 'additional_image',
      }),
    );
  }
  const brochure = product.assets?.brochure
    ? await uploadAsset(product.assets.brochure, objectPrefix, 'brochure', {
        allowedExtensions: ['.pdf'],
        contentType: 'application/pdf',
        product,
        assetType: 'brochure',
      })
    : undefined;

  const name = requiredString(product.name, `name for ${product.productId}`);
  const sku = optionalString(product.sku);
  const modelNumber = optionalString(product.modelNumber);
  await upsertDocument(
    firestore.collection('products').doc(product.productId),
    compactObject({
      productId: product.productId,
      name,
      nameNormalized: normalize(name),
      sku,
      skuNormalized: sku ? normalize(sku) : undefined,
      modelNumber,
      modelNormalized: modelNumber ? normalize(modelNumber) : undefined,
      searchPrefixes: createSearchPrefixes([name, sku, modelNumber]),
      companyId: product.companyId,
      companyName: company.name,
      companySlug: company.slug || company.id,
      categoryId: product.categoryId,
      categoryName: category.name,
      categorySlug: category.slug || category.id,
      subcategoryId: optionalString(product.subcategoryId),
      subcategoryName: optionalString(product.subcategoryName),
      subcategorySlug: optionalString(product.subcategorySlug),
      price: finiteNumber(product.price, 0),
      currency: optionalString(product.currency) || 'INR',
      discountPercentage: finiteNumber(product.discountPercentage, 0),
      inStock: product.inStock === true,
      stockQuantity:
        product.stockQuantity === undefined
          ? undefined
          : finiteNumber(product.stockQuantity, 0),
      active: product.active !== false,
      shortDescription: optionalString(product.shortDescription),
      description: optionalString(product.description) || '',
      specifications: product.specifications ?? {},
      thumbnail,
      mainImage,
      additionalImages,
      brochure,
      catalogId: optionalString(product.catalogId),
      catalogName: optionalString(product.catalogName),
      catalogPage: product.catalogPage,
      sourceFile: optionalString(product.sourceFile),
      updatedAt: FieldValue.serverTimestamp(),
    }),
  );

  importedProducts += 1;
  if (importedProducts % 100 === 0) {
    process.stdout.write(`Imported ${importedProducts} products\n`);
  }
}

process.stdout.write(
  `Import complete: ${importedProducts} products, ${manifest.companies.length} companies, ${manifest.categories.length} categories.\n`,
);

async function uploadThumbnail(product, objectPrefix) {
  const sourcePath = resolveAssetPath(product.assets.thumbnail);
  const source = await readFile(sourcePath);
  const body = await sharp(source)
    .resize({
      width: 400,
      height: 400,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  return saveObject(body, objectPrefix, 'thumbnail', '.webp', {
    contentType: 'image/webp',
    product,
    assetType: 'thumbnail',
  });
}

async function uploadAsset(fileName, objectPrefix, objectBaseName, options) {
  const extension = extname(fileName).toLowerCase();
  if (!options.allowedExtensions.includes(extension)) {
    throw new Error(
      `${fileName} must use one of: ${options.allowedExtensions.join(', ')}`,
    );
  }
  const body = await readFile(resolveAssetPath(fileName));
  return saveObject(body, objectPrefix, objectBaseName, extension, options);
}

async function saveObject(
  body,
  objectPrefix,
  objectBaseName,
  extension,
  options,
) {
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
  const path = `${objectPrefix}/${objectBaseName}-${hash}${extension}`;
  const file = bucket.file(path);
  const [exists] = await file.exists();

  if (!exists) {
    await file.save(body, {
      resumable: false,
      metadata: {
        contentType: options.contentType,
        cacheControl: 'public, max-age=31536000, immutable',
        metadata: compactObject({
          productId: options.product.productId,
          companyId: options.product.companyId,
          assetType: options.assetType,
          sourceCatalog: optionalString(options.product.catalogName),
          sourcePage:
            options.product.catalogPage === undefined
              ? undefined
              : String(options.product.catalogPage),
        }),
      },
    });
  }

  return { bucket: bucketName, path };
}

function resolveAssetPath(fileName) {
  const absolutePath = resolve(absoluteAssetsPath, fileName);
  if (
    absolutePath !== absoluteAssetsPath &&
    !absolutePath.startsWith(`${absoluteAssetsPath}/`)
  ) {
    throw new Error(`Asset must stay inside the assets directory: ${fileName}`);
  }
  return absolutePath;
}

function createSearchPrefixes(values) {
  const prefixes = new Set();
  for (const value of values.filter(Boolean)) {
    const normalized = normalize(value).slice(0, 120);
    for (let index = 1; index <= normalized.length; index += 1) {
      prefixes.add(normalized.slice(0, index));
    }
  }
  return [...prefixes];
}

function normalize(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function validateManifest(value) {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray(value.companies) ||
    !Array.isArray(value.categories) ||
    !Array.isArray(value.products)
  ) {
    throw new Error(
      'Manifest must contain companies, categories, and products arrays',
    );
  }
}

function assertId(value, label) {
  if (
    typeof value !== 'string' ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(value)
  ) {
    throw new Error(`Invalid ${label}: ${String(value)}`);
  }
}

function requiredString(value, label) {
  const string = optionalString(value);
  if (!string) throw new Error(`Missing ${label}`);
  return string;
}

function optionalString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function finiteNumber(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

function contentTypeFor(fileName) {
  switch (extname(fileName).toLowerCase()) {
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    case '.png':
      return 'image/png';
    default:
      return 'image/jpeg';
  }
}

async function upsertDocument(reference, data) {
  try {
    await reference.create({
      ...data,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    if (error?.code !== 6 && error?.code !== 'ALREADY_EXISTS') {
      throw error;
    }
    await reference.set(data, { merge: true });
  }
}
