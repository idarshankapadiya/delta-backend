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
- Company/category renames propagate their denormalized name and slug into existing product documents.
- Product deletion also attempts to remove its own GCS assets. Company/category deletion returns `409 Conflict` while products still reference the resource, and the out-of-stock delete endpoint refuses in-stock products.

## Firestore Document Requirements

- `companies/{companyId}`: `id`, `name`, `slug`, `active`, `sortOrder`.
- `categories/{categoryId}`: `id`, `name`, `slug`, `companyIds`, `active`, `sortOrder`.
- `products/{productId}`: normalized identity/classification/commerce fields including `discountPercentage`, denormalized display names, `searchPrefixes`, specifications, and GCS references shaped as `{ bucket, path }`.
- Keep large descriptions and specification maps out of custom composite indexes.

## Required Runtime Configuration

- `GCS_PRODUCT_BUCKET`: catalog asset bucket.
- `PRODUCT_FIRESTORE_DATABASE_ID`: product Firestore database ID. If omitted, the backend falls back to `FIRESTORE_DATABASE_ID`.
- `PRODUCT_ASSET_DELIVERY`: `signed` (default) or `public`.
- `PRODUCT_PUBLIC_ASSET_BASE_URL`: optional CDN/public base URL for public delivery.
- `PRODUCT_SIGNED_URL_TTL_SECONDS`: optional signed URL lifetime between 300 and 86400 seconds; default 3600.
- Local development can use `GOOGLE_APPLICATION_CREDENTIALS`. Cloud Run must use its attached runtime service account instead of a JSON key.
- The checked-in deployment script configures the existing `darshanent_product_dir` bucket with private/signed delivery.

## Manual GCP Work

1. Create or select a Native-mode Firestore database geographically close to Cloud Run.
2. Confirm `darshanent_product_dir` exists. It can remain private because the prepared deployment uses signed delivery.
3. Give the Cloud Run runtime service account Firestore read/write access and GCS object read/delete access; signed URLs may also require service-account token-creator permission.
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
- `PUT /api/business/products/:productId`
- `DELETE /api/business/products/:productId`
- `DELETE /api/business/products/out-of-stock/:productId`

Use `POST /api/business/auth/google` first. Send its returned CSRF token as `X-CSRF-Token`; the browser or Postman cookie jar must also retain the business session cookie.

## Remaining Before Production

- Replace the example manifest with real normalized catalog data and assets.
- Confirm whether assets are public/CDN-backed or private/signed and set the matching environment variables/IAM.
- Build Firestore indexes and import data in the intended project.
- Add the new environment variables to Cloud Run and manually deploy the backend.
- Change the frontend feature flag/route policy if `/product` should be visible when `APP_ENVIRONMENT` is production.
