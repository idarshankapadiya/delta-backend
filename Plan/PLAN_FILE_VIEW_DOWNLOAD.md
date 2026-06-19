# Catalog View And Download Implementation

## What Has Been Done

- Implemented public catalog metadata APIs for frontend catalog browsing:
  - `GET /api/catalog/all`
  - `POST /api/catalog/library`
- Implemented slug-based PDF preview/download access:
  - `POST /api/catalog/documents/access`
  - Request identity uses `company_slug`, optional `category_slug`, and `document_slug`.
  - `document_id` is returned as metadata only and is not used as the public access key.
- Kept private PDFs in `darshanent_catalog_dir` behind short-lived Google Cloud Storage signed URLs.
- Exposed public document thumbnails from `darshanent-thumbnail-dir` through `thumbnail_url` values in catalog metadata responses.
- Implemented catalog inquiry and gated access flow:
  - `POST /api/catalog/access` records inquiry details only.
  - `POST /api/catalog/access/google` verifies Google ID tokens and creates `catalog_access`.
  - `POST /api/catalog/access/request-otp` creates WhatsApp or email OTP challenges.
  - `POST /api/catalog/access/verify-otp` verifies OTP challenges and creates `catalog_access`.
- Implemented HttpOnly cookie access validation before signed PDF URL generation.
- Implemented origin checks for browser catalog POST requests while allowing no-origin local tooling requests.
- Implemented in-memory rate limiting for inquiry, Google access, OTP request/verify, signed URL access, downloads, and invalid document selections.
- Implemented email OTP delivery adapters for SES and ZeptoMail.
- Implemented WhatsApp OTP delivery adapters for Meta Cloud API and a generic HTTP provider.
- Added temporary disabled-delivery/master-OTP behavior for current rollout testing.
- Added catalog upload/update/delete support that stores private PDFs and generates public WebP thumbnails.
- Documented the active frontend integration contract: render metadata and thumbnails from public APIs, then request signed URLs only after backend access is granted.

## Assumptions

- The backend owns all Google Cloud credentials and service-account access.
- Frontend and Postman never receive service account credentials or direct private PDF bucket permissions.
- Public catalog identity is slug-based, not filename-based, path-based, or `document_id`-based.
- Thumbnails are safe to expose publicly because they are preview assets, not protected PDFs.
- The frontend will use the returned `thumbnail_url` values directly and lazy-load images.
- The frontend will request preview/download signed URLs only through `POST /api/catalog/documents/access`.
- Google sign-in is the preferred access path, with WhatsApp and email OTP as fallback paths.
- Requests without an `Origin` header are local/server tooling requests and can be allowed.
- Current traffic is low enough for in-memory sessions, OTP challenges, and rate limits.
- Backend restart invalidating active catalog access sessions is acceptable for the current phase.

## Limitations

- `catalog_access` sessions are stored in memory, so backend restarts clear active access.
- OTP challenges and rate limits are stored in memory, so multiple backend instances will not share that state.
- OTP delivery is disabled unless `CATALOG_OTP_DELIVERY_ENABLED=true`.
- The temporary master OTP defaults to `190399` unless `CATALOG_MASTER_OTP_CODE` is configured.
- The one-request master OTP shortcut in `request-otp` is temporary and should be removed before public production use.
- Current rate-limit responses return `429` but do not include `Retry-After`.
- GCS CORS is not required for direct browser PDF viewing, but it will be needed if the frontend fetches signed PDFs as blobs.
- Nested legacy PDF object names, non-PDF objects, folder placeholders, missing required snake_case metadata, and camelCase metadata are intentionally unsupported.
- Replacing a PDF creates a new `document_id`; cached frontend metadata should refresh after replacement.
- Replacing a PDF with a different filename changes the derived thumbnail URL.
- Persistent audit/reporting storage is not implemented.

## Implementation Details

Implemented files and areas:

- `src/catalog/catalog.controller.ts`
- `src/catalog/catalog.service.ts`
- `src/catalog/catalog-access.service.ts`
- `src/catalog/catalog-rate-limiter.service.ts`
- `src/catalog/catalog-origin.guard.ts`
- `src/catalog/catalog-admin.guard.ts`
- `src/catalog/dto/catalog-google-access.dto.ts`
- `src/catalog/dto/catalog-otp-request.dto.ts`
- `src/catalog/dto/catalog-verify-otp.dto.ts`
- `src/catalog/catalog.controller.spec.ts`
- `src/catalog/catalog.service.spec.ts`
- `src/catalog/catalog-origin.guard.spec.ts`
- `postman/delta-backend-catalog-gcs.postman_collection.json`

Catalog metadata:

- `GET /api/catalog/all` lists catalog documents from `GCS_CATALOG_BUCKET` with optional `GCS_CATALOG_PREFIX`.
- `POST /api/catalog/library` builds from the same catalog listing and filters by requested company slugs.
- Required object metadata for public listing: `document_id`, `company_slug`, `document_slug`, and `display_name`.
- Optional object metadata includes `category_slug`, `company_name`, `category_name`, `original_file_name`, and `uploaded_at`.
- Document thumbnails are derived from `company_slug` and uploaded PDF file base name under `catalog-thumbnails/v1`.

PDF access:

- `POST /api/catalog/documents/access` requires a valid `catalog_access` HttpOnly cookie.
- The endpoint slugifies the requested selection, validates the matching document, and signs the resolved private GCS PDF object.
- Signed URL responses use `inline` disposition for `preview` and `attachment` disposition for `download`.
- Signed URL TTL defaults to `900` seconds through `CATALOG_SIGNED_URL_TTL_SECONDS`.

Access control:

- `POST /api/catalog/access` is inquiry-only and does not grant access.
- Google access verifies the ID token audience against `CATALOG_GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_ID` and requires a verified Google email.
- OTP challenge state stores channel, contact key, hashed OTP, attempts, resend count, expiry, IP, user agent, and inquiry fields.
- Successful Google or OTP verification creates an opaque backend session token and sets `catalog_access` with `HttpOnly`, `SameSite=Lax`, `Path=/api/catalog`, and `Secure` in production.
- The backend does not trust localStorage, hidden fields, frontend route state, or any client-provided access flag.

Storage and deployment configuration:

```env
GCS_CATALOG_BUCKET=darshanent_catalog_dir
GCS_CATALOG_PUBLIC_ASSET_BUCKET=darshanent-thumbnail-dir
CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/darshanent-thumbnail-dir
CATALOG_SIGNED_URL_TTL_SECONDS=900
CATALOG_OTP_TTL_SECONDS=600
CATALOG_OTP_RESEND_AFTER_SECONDS=60
CATALOG_OTP_MAX_ATTEMPTS=5
CATALOG_OTP_DELIVERY_ENABLED=false
CATALOG_MASTER_OTP_CODE=190399
CATALOG_GOOGLE_CLIENT_ID=google-web-client-id.apps.googleusercontent.com
FRONTEND_ORIGIN=http://localhost:5173
```

Provider-specific OTP env vars are supported for SES, ZeptoMail, Meta Cloud API, and generic HTTP WhatsApp providers. Production should provide these through deployment secrets/env vars, not frontend values.

GCS permissions:

- The backend service account needs list/read/sign capability on `darshanent_catalog_dir`.
- The backend service account needs write/edit capability on `darshanent-thumbnail-dir` for upload workflows.
- Cloud Run should use an attached service account instead of local JSON credentials.
- If Cloud Run signing uses IAM instead of a local key, grant the runtime identity the signing permission required for `signBlob`.

## Production Follow-Ups

- Configure the production Google OAuth client id.
- Enable and verify real OTP delivery before public launch.
- Remove or disable temporary master OTP behavior before public production use.
- Choose and configure the final email OTP provider.
- Choose and configure the final WhatsApp OTP provider and approved authentication template.
- Move sessions, OTP challenges, and rate limits to Redis or a database before multi-instance production scaling.
- Persist inquiry/audit records if historical reporting is required.
- Add `Retry-After` headers to rate-limit responses if the UI needs precise cooldown display.

## Verification Notes

- Catalog metadata APIs return public thumbnail URLs.
- Public thumbnails load directly from `darshanent-thumbnail-dir`.
- PDF access fails without a valid `catalog_access` cookie.
- Signed PDF URL generation works through slug selection and returns the resolved `document_id`.
- Google sign-in grants access only after backend ID token verification.
- OTP request does not grant access by itself.
- Wrong or expired OTP verification does not grant access.
- Successful OTP verification grants access through the backend-issued HttpOnly cookie.
- Obsolete endpoint shapes and document-id signing payloads are intentionally not documented or supported.
