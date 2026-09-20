# Product Catalog: Firestore, GCS, API, And React

## Implemented

- `src/product/` exposes public `GET /api/companies`, `GET /api/categories`, `GET /api/products`, and `GET /api/products/:productId` endpoints.
- Product listing queries always apply `active == true`, deterministic ordering, a maximum limit of 100, and Firestore `startAfter` pagination.
- Cursors are opaque and bound to the active filters, search value, and sort order.
- List responses contain lightweight card data and thumbnail URLs. Detail responses contain descriptions, specifications, main/additional image URLs, and an optional brochure URL.
- GCS object paths are the stable Firestore references. The API converts them to public or time-limited signed URLs; file bytes do not pass through Cloud Run.
- `scripts/import-products.mjs` validates a JSON manifest, generates 400px WebP thumbnails, uses content-hashed object names, uploads assets with immutable cache metadata, and idempotently merges company/category/product documents.
- `scripts/create-product-firestore-indexes.sh` submits the composite indexes required by all supported filter and sort combinations.
- The React product page calls the backend API, uses string product IDs, filters by company/category/stock, searches through the backend, and uses cursor pagination.
- Authenticated business APIs create, update, and delete product companies, categories, and products. All mutations require the business session, approved origin, and CSRF token.
- Product updates support name, SKU/model, company/category, price, currency, discount, inventory, descriptions, specifications, and GCS asset references.
- `PUT` and `DELETE /api/business/products/:productId/specifications/:key` edit or remove one existing specification. PUT accepts `{ "value": ... }` and an optional replacement `key`; both operations update the specification map in a Firestore transaction, return 404 for missing products or keys, and PUT returns 409 for a duplicate replacement key.
- Multipart product creation requires a main image; updates may provide a replacement. The backend generates a resized WebP thumbnail from every uploaded main image. Both endpoints also accept up to 20 additional images and an optional PDF brochure; the browser never supplies object paths.
- Dedicated business image routes replace or delete the main image and its thumbnail, append an additional image, or replace/delete one additional image by zero-based index. Main-image deletion also clears legacy image and thumbnail path fields. Single-image uploads use the multipart `image` field and the same image validation as product uploads. Product detail returns `additionalImageIndices` alongside resolved URLs so an unavailable image URL cannot shift the editor's delete target. Image references update in Firestore transactions; prior owned GCS objects are cleaned after commit.
- Generated WebP thumbnails are stored under `product-thumbnails/v1/{companyId}/{productId}/` in `GCS_PRODUCT_THUMBNAIL_BUCKET`. Original main images, additional images, and brochures are stored under `products/{companyId}/{productId}/` in `GCS_PRODUCT_BUCKET`.
- Company/category renames propagate their denormalized name and slug into existing product documents.
- Product deletion sweeps every object under its GCS product and thumbnail prefixes, including orphaned upload versions and folder-marker objects, then removes empty hierarchical-namespace folders from child to parent. It atomically deletes its Firestore company or category when no other products reference them; deleting the final company product also sweeps both company-level GCS prefixes and folders. Direct deletion of an unused company performs the same company-prefix cleanup. The response returns nullable `deletedCompanyId` and `deletedCategoryId` fields so clients can remove those resources immediately. Company/category deletion returns `409 Conflict` while products still reference the resource, and the out-of-stock delete endpoint refuses in-stock products.

## Firestore Document Requirements

- `companies/{companyId}`: `id`, `name`, `slug`, `active`, `sortOrder`.
- `categories/{categoryId}`: `id`, `name`, `slug`, `companyIds`, `active`, `sortOrder`.
- `products/{productId}`: normalized identity/classification/commerce fields including `discountPercentage`, denormalized display names, `searchPrefixes`, specifications, and GCS references shaped as `{ bucket, path }`.
- Keep large descriptions and specification maps out of custom composite indexes.

## Required Runtime Configuration

- `GCS_PRODUCT_BUCKET`: product main image, additional image, and brochure bucket.
- `GCS_PRODUCT_THUMBNAIL_BUCKET`: product thumbnail bucket. It falls back to `GCS_CATALOG_PUBLIC_ASSET_BUCKET` so product and catalog thumbnails can share `darshanent-thumbnail-dir` while keeping separate prefixes.
- `PRODUCT_IMAGE_UPLOAD_MAX_BYTES`, `PRODUCT_BROCHURE_UPLOAD_MAX_BYTES`, and `PRODUCT_UPLOAD_TOTAL_MAX_BYTES`: optional upload limits; defaults are 20 MB per image, 100 MB per brochure, and 200 MB combined.
- `PRODUCT_THUMBNAIL_WIDTH` and `PRODUCT_THUMBNAIL_QUALITY`: optional generated WebP settings; defaults are 480 pixels and quality 80.
- `PRODUCT_FIRESTORE_DATABASE_ID`: product Firestore database ID. If omitted, the backend falls back to `FIRESTORE_DATABASE_ID`.
- `PRODUCT_ASSET_DELIVERY`: `signed` (default) or `public`.
- `PRODUCT_PUBLIC_ASSET_BASE_URL`: optional CDN/public base URL for public delivery.
- `PRODUCT_SIGNED_URL_TTL_SECONDS`: optional signed URL lifetime between 300 and 86400 seconds; default 3600.
- Local development can use `GOOGLE_APPLICATION_CREDENTIALS`. Cloud Run must use its attached runtime service account instead of a JSON key.
- The checked-in deployment script configures the existing `darshanent_product_dir` bucket with private/signed delivery.

## Manual GCP Work

1. Create or select a Native-mode Firestore database geographically close to Cloud Run.
2. Confirm `darshanent_product_dir` exists. It can remain private because the prepared deployment uses signed delivery.
3. Give the Cloud Run runtime service account Firestore read/write access and GCS object read/list/delete and folder list/delete access; prefix cleanup must remove both objects and empty hierarchical-namespace folders. Signed URLs may also require service-account token-creator permission.
4. Run the index script and wait until every index reports `READY`.
5. Prepare a manifest based on `examples/product-catalog.manifest.json` and its referenced asset directory.
6. Run the importer without `--apply`; review counts and validation output.
7. Run the importer with `--apply` to write GCS objects and Firestore documents.
8. Deploy the verified backend manually, then smoke-test all filter combinations and cursor continuation before enabling the product route in production.

## Verification Commands

```sh
npm run lint
npm run build
npm run products:import -- --manifest ./examples/product-catalog.manifest.json --assets /absolute/path/to/assets
```

## Authenticated Product Administration APIs

- `POST /api/business/companies`
- `PUT /api/business/companies/:companyId`
- `DELETE /api/business/companies/:companyId`
- `POST /api/business/categories`
- `PUT /api/business/categories/:categoryId`
- `DELETE /api/business/categories/:categoryId`
- `POST /api/business/products`
- `POST /api/business/products/upload` (multipart product payload and assets)
- `PUT /api/business/products/:productId`
- `PUT /api/business/products/:productId/upload` (multipart product payload and replacement assets)
- `PUT` / `DELETE /api/business/products/:productId/main-image`
- `POST /api/business/products/:productId/additional-images`
- `PUT` / `DELETE /api/business/products/:productId/additional-images/:index`
- `DELETE /api/business/products/:productId`
- `DELETE /api/business/products/out-of-stock/:productId`

Use `POST /api/business/auth/google` first. Send its returned CSRF token as `X-CSRF-Token`; the browser or Postman cookie jar must also retain the business session cookie.

## Remaining Before Production

- Replace the example manifest with real normalized catalog data and assets.
- Confirm whether assets are public/CDN-backed or private/signed and set the matching environment variables/IAM.
- Build Firestore indexes and import data in the intended project.
- Add the new environment variables to Cloud Run and manually deploy the backend.
- Change the frontend feature flag/route policy if `/product` should be visible when `APP_ENVIRONMENT` is production.
