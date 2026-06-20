# Catalog Backend Implementation Doc

## Summary

The catalog backend owns public catalog metadata, private PDF storage, public thumbnail storage, customer access sessions, signed PDF preview/download URLs, and admin upload/update/delete workflows.

- Public metadata APIs expose catalog companies, categories, documents, and public `thumbnail_url` values.
- Private PDFs live in `darshanent_catalog_dir` and are never public.
- Public thumbnails live in `darshanent-thumbnail-dir` and are loaded directly by browsers.
- Public catalog identity is slug-based: `company_slug + optional category_slug + document_slug`.
- Admin mutation identity is `document_id`, a generated ULID for the current uploaded PDF revision.
- Customer PDF preview/download requires a valid backend `catalog_access` HttpOnly cookie.
- The frontend restores header login state through `GET /api/catalog/access/me` because the cookie is HttpOnly.
- Admin upload/update/delete is currently protected by `x-backend-admin-token`; the future browser business UI should use a separate backend business session wrapper.
- Contact form messages are stored server-side in Firestore database `client-message-db`, collection `contact_messages`.
- Backward compatibility is not kept unless a future task explicitly asks for it.

## Implemented Files

- `src/catalog/catalog.controller.ts`
- `src/catalog/catalog.service.ts`
- `src/catalog/catalog-access.service.ts`
- `src/catalog/catalog-rate-limiter.service.ts`
- `src/catalog/catalog-origin.guard.ts`
- `src/catalog/catalog-admin.guard.ts`
- `src/catalog/dto/catalog-access.dto.ts`
- `src/catalog/dto/catalog-google-access.dto.ts`
- `src/catalog/dto/catalog-otp-request.dto.ts`
- `src/catalog/dto/catalog-verify-otp.dto.ts`
- `src/catalog/dto/document-access.dto.ts`
- `src/catalog/catalog.controller.spec.ts`
- `src/catalog/catalog.service.spec.ts`
- `src/catalog/catalog-origin.guard.spec.ts`
- `src/message/message.controller.ts`
- `src/message/message.service.ts`
- `src/message/dto/create-message.dto.ts`
- `src/message/message.controller.spec.ts`
- `src/message/message.service.spec.ts`
- `postman/delta-backend-catalog-gcs.postman_collection.json`

## Environment

```env
HOST=0.0.0.0
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173,https://darshanent.co.in

GCS_CATALOG_BUCKET=darshanent_catalog_dir
GCS_CATALOG_PREFIX=
GCS_CATALOG_PUBLIC_ASSET_BUCKET=darshanent-thumbnail-dir
CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/darshanent-thumbnail-dir
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/catalog-api-sa.json

BACKEND_ADMIN_TOKEN=use-a-long-random-secret
CATALOG_UPLOAD_MAX_BYTES=104857600

CATALOG_SIGNED_URL_TTL_SECONDS=900
CATALOG_ACCESS_TTL_SECONDS=15552000
GOOGLE_CLIENT_ID=google-web-client-id.apps.googleusercontent.com
FIRESTORE_DATABASE_ID=client-message-db

CATALOG_OTP_TTL_SECONDS=600
CATALOG_OTP_RESEND_AFTER_SECONDS=60
CATALOG_OTP_MAX_ATTEMPTS=5
CATALOG_OTP_DELIVERY_ENABLED=false
CATALOG_MASTER_OTP_CODE=190399
```

- `PORT` defaults to `3000`; startup logs show both the bind URL and local URL.
- `CATALOG_UPLOAD_MAX_BYTES` defaults to 100 MB when unset.
- `CATALOG_SIGNED_URL_TTL_SECONDS` defaults to 900 seconds when unset.
- `CATALOG_ACCESS_TTL_SECONDS` defaults to 180 days when unset.
- Provider-specific OTP env vars are supported for SES, ZeptoMail, Meta Cloud API, and generic HTTP WhatsApp providers.
- Production should provide secrets through deployment env/secrets, not frontend values or Postman.

## Message Endpoints
### Post messages endpoints

- Writes one document to Firestore database `client-message-db`, collection `contact_messages`.
- Adds backend-side `created_at`.
- Does not verify email ownership, phone ownership, or OTP.
- Browser requests are limited by the same allowed-origin guard pattern used by catalog POST routes.
- Required fields: `name`, `mobile`, `email`, and `message`.

### Get messages endpoint

- Returns all messages ordered by `created_at` newest first.
- Requires `BACKEND_ADMIN_TOKEN` through `x-backend-admin-token`.
- The browser never accesses Firestore directly.

## GCS Storage

Private PDF object:

```txt
gs://darshanent_catalog_dir/{GCS_CATALOG_PREFIX?}/{company_slug}/{uploaded_pdf_file_name}
```

Public thumbnail object:

```txt
gs://darshanent-thumbnail-dir/catalog-thumbnails/v1/{company_slug}/{uploaded_pdf_file_base_name}.webp
```

- The backend service account needs list/read/sign capability on `darshanent_catalog_dir`.
- The backend service account needs write/edit capability on `darshanent-thumbnail-dir` for upload workflows.
- Public users only need read/view access to `darshanent-thumbnail-dir`.
- Cloud Run should use an attached service account instead of local JSON credentials.
- If Cloud Run signing uses IAM instead of a local key, grant the runtime identity the signing permission required for `signBlob`.
- Keep GCS Object Versioning disabled if old PDF or thumbnail generations must not remain in GCS.

## Public Metadata APIs

```http
GET /api/catalog/all
POST /api/catalog/library
```

- `GET /api/catalog/all` lists catalog documents from `GCS_CATALOG_BUCKET` with optional `GCS_CATALOG_PREFIX`.
- `POST /api/catalog/library` builds from the same listing and filters by requested company slugs.
- Required object metadata for public listing: `document_id`, `company_slug`, `document_slug`, and `display_name`.
- Optional object metadata includes `category_slug`, `company_name`, `category_name`, `original_file_name`, and `uploaded_at`.
- Metadata responses include display labels for company/category slug fields: `company_name` and optional `category_name`.
- When explicit company/category name metadata is missing, slug display labels are derived by replacing `_`/`-` with spaces and capitalizing each word.
- Documents use `display_name` as the UI label; there is no separate `document_name`.
- Document thumbnails are derived from `company_slug` and uploaded PDF file base name under `catalog-thumbnails/v1`.
- Nested legacy PDF object names, non-PDF objects, folder placeholders, missing required snake_case metadata, and camelCase metadata are intentionally unsupported.

## Customer Access APIs

Inquiry-only contact capture:

```http
POST /api/catalog/access
```

- Records inquiry details only.
- Returns `{ "ok": true, "inquiry_only": true }`.
- Does not set `catalog_access`.
- Must not be used as an access grant path.

Google access:

```http
POST /api/catalog/access/google
```

- Verifies the Google ID token audience against `GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_ID`.
- Requires a verified Google email.
- Creates an opaque backend session token.
- Sets `catalog_access` with `HttpOnly`, `SameSite=Lax`, `Path=/api/catalog`, `Expires`, and `Secure` in production.
- Returns `auth_provider`, `email`, `name`, and `expires_at`.

Current session lookup:

```http
GET /api/catalog/access/me
```

- Reads the `catalog_access` HttpOnly cookie server-side.
- Returns the current session summary when the cookie maps to a valid unexpired session.
- Returns `401` when the cookie is missing, expired, invalid, or the in-memory session was lost.
- Used by `delta-ui` Header restore flow after refresh/revisit.
- Does not create, refresh, or extend the session.
- Requires `credentials: "include"` from browser clients.

Successful response:

```json
{
  "ok": true,
  "auth_provider": "google",
  "email": "customer@example.com",
  "name": "Customer",
  "expires_at": "2026-12-20T00:00:00.000Z"
}
```

OTP access:

```http
POST /api/catalog/access/request-otp
POST /api/catalog/access/verify-otp
```

- OTP challenge state stores channel, contact key, hashed OTP, attempts, resend count, expiry, IP, user agent, and inquiry fields.
- Successful OTP verification creates `catalog_access`.
- OTP delivery is disabled unless `CATALOG_OTP_DELIVERY_ENABLED=true`.
- The temporary master OTP defaults to `190399` unless `CATALOG_MASTER_OTP_CODE` is configured.
- The one-request master OTP shortcut in `request-otp` is temporary and should be removed before public production use.
- Current frontend release should use Google access for preview/download until OTP delivery and validation are production-ready.

## Signed PDF Access

```http
POST /api/catalog/documents/access
```

Request:

```json
{
  "company_slug": "schneider",
  "category_slug": "industrial-automation",
  "document_slug": "plc-catalog",
  "action": "preview"
}
```

Response:

```json
{
  "document_id": "01J...",
  "url": "https://storage.googleapis.com/...",
  "expires_at": "2026-06-20T10:45:00.000Z",
  "ttl_seconds": 900,
  "file_name": "PMS_Metering.pdf"
}
```

- Requires a valid `catalog_access` HttpOnly cookie.
- Request identity uses `company_slug`, optional `category_slug`, and `document_slug`.
- `document_id` is returned as metadata only and is not used as the public access key.
- The endpoint slugifies the requested selection, validates the matching document, and signs the resolved private GCS PDF object.
- Signed URL responses use `inline` disposition for `preview` and `attachment` disposition for `download`.
- Already generated signed URLs continue working until their own expiry.

## Admin Upload API

All admin endpoints currently require:

```http
x-backend-admin-token: <BACKEND_ADMIN_TOKEN>
```

```http
POST /api/catalog/documents
PUT /api/catalog/documents/:document_id
DELETE /api/catalog/documents/:document_id
```

Create request:

```http
POST /api/catalog/documents
Content-Type: multipart/form-data

company_slug=schneider
category_slug=industrial-automation
document_slug=plc-catalog
display_name=PLC Catalog
file=<PDF binary>
```

Update request:

```http
PUT /api/catalog/documents/:document_id
Content-Type: multipart/form-data

display_name=PLC Catalog 2026
category_slug=industrial-automation
file=<optional PDF binary>
```

Delete request:

```http
DELETE /api/catalog/documents/:document_id
```

Implemented behavior:

- Create validates the PDF, writes it directly under the company folder with the uploaded PDF filename, generates a ULID `document_id`, stores PDF metadata, and uploads a public first-page thumbnail.
- PDF replacement writes the new uploaded PDF filename, generates a new `document_id`, preserves public slugs, deletes the previous PDF object, and replaces the thumbnail with the new uploaded filename.
- Metadata-only update changes display/category metadata and keeps the same `document_id`.
- Delete removes the private PDF object and public document thumbnail object.
- Duplicate create for an existing `{company_slug}/{document_slug}` returns conflict instead of creating a second object.
- Old app-level PDFs and thumbnails are not retained after replacement.
- Company-level thumbnails are not generated or returned; only PDF/document leaf records have thumbnails.

PDF metadata stored on the object:

```txt
document_id
company_slug
category_slug
document_slug
display_name
original_file_name
uploaded_at
```

Thumbnail generation:

- Source: first PDF page.
- Format: WebP.
- Width: 480 px.
- Quality: about 70-72.
- Object metadata: `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`.
- If thumbnail upload fails after PDF replacement, the public thumbnail object is deleted to avoid showing a stale thumbnail.

## Rate Limiting And Origin Checks

- Browser catalog POST requests require an allowed `Origin`; no-origin local tooling requests are allowed.
- In-memory rate limiting applies to inquiry, Google access, OTP request/verify, signed URL access, downloads, and invalid document selections.
- Current rate-limit responses return `429` but do not include `Retry-After`.
- Signed URL generation has an hourly limit per IP.
- Download has a daily limit per access session.

## Rules

- Do not add backward-compatible endpoints, DTO fallbacks, Postman examples, or docs unless explicitly requested.
- Do not use PDF filenames, spaces, or GCS object paths as public catalog identity.
- Do not use `document_id` in frontend routes or signed URL request payloads.
- Do not add a thumbnail signing flow.
- Do not embed thumbnail bytes or base64 in JSON.
- Do not construct private GCS paths in the browser.
- Do not expose service account credentials, GCS credentials, or `BACKEND_ADMIN_TOKEN` to the browser.
- The backend does not trust localStorage, hidden fields, frontend route state, or any client-provided access flag.
- PDFs remain private and are accessed only through signed URLs generated by the backend.

## Ripple Effects Between Upload And View/Download

- Catalog listing must only include direct company-folder PDF objects that have the required snake_case metadata.
- `document_id` is not stable across PDF replacement, so frontend routes and signed URL requests must never depend on it.
- Public routes and signed URL requests use slugs: `company_slug + optional category_slug + document_slug`.
- Thumbnail URLs are based on the uploaded PDF filename, so replacement with a differently named PDF changes the thumbnail URL.
- PDF signed URLs may resolve to a different `document_id` after replacement, and the response should expose that current `document_id`.
- Metadata-only updates can change `display_name` or `category_slug` without changing the private PDF object or `document_id`.
- PDF replacement changes `document_id`, `updated_at`, file metadata, and thumbnail content while preserving public slug identity.
- Deleting a document removes it from `/api/catalog/all` and `/api/catalog/library` because the backing uploaded PDF object is deleted.
- If `GCS_CATALOG_PUBLIC_ASSET_BUCKET` or `CATALOG_PUBLIC_ASSET_BASE_URL` is missing, thumbnail upload/list display becomes incomplete even though PDF signing can still work.

## Limitations

- `catalog_access` sessions are stored in memory, so backend restarts clear active access before browser cookie expiry.
- OTP challenges and rate limits are stored in memory, so multiple backend instances will not share that state.
- GCS CORS is not required for direct browser PDF viewing, but it will be needed if the frontend fetches signed PDFs as blobs.
- Replacing a PDF creates a new `document_id`; cached frontend metadata should refresh after replacement.
- Replacing a PDF with a different filename changes the derived thumbnail URL.
- Persistent audit/reporting storage is not implemented.

## Production Follow-Ups

- Configure the production Google OAuth client id.
- Enable and verify real OTP delivery before using OTP as a public fallback.
- Remove or disable temporary master OTP behavior before public production use.
- Choose and configure the final email OTP provider.
- Choose and configure the final WhatsApp OTP provider and approved authentication template.
- Move sessions, OTP challenges, and rate limits to Redis or a database before multi-instance production scaling.
- Persist inquiry/audit records if historical reporting is required.
- Add `Retry-After` headers to rate-limit responses if the UI needs precise cooldown display.
- Add the future business auth wrapper before exposing admin mutation routes to `business-delta-ui`.

## Verification

- Backend startup logs include the listening host/port and local `/api` URL.
- Catalog metadata APIs return public thumbnail URLs.
- Public thumbnails load directly from `darshanent-thumbnail-dir`.
- Inquiry-only access does not set `catalog_access`.
- Google sign-in grants access only after backend ID token verification.
- `GET /api/catalog/access/me` returns session details for a valid `catalog_access` cookie.
- `GET /api/catalog/access/me` returns `401` without a valid `catalog_access` cookie.
- PDF access fails without a valid `catalog_access` cookie.
- Signed PDF URL generation works through slug selection and returns the resolved `document_id`.
- OTP request does not grant access by itself.
- Wrong or expired OTP verification does not grant access.
- Successful OTP verification grants access through the backend-issued HttpOnly cookie.
- Create upload returns `document_id`, slug metadata, PDF object name, and public `thumbnail_url`.
- PDF replacement returns a new `document_id` and may return a new public thumbnail URL when the uploaded filename changes.
- Metadata-only update keeps the same `document_id`.
- Delete removes the uploaded PDF object and matching public thumbnail.
- Obsolete endpoint shapes and document-id signing payloads are intentionally not documented or supported.
