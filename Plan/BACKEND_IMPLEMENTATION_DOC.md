# Catalog Backend Implementation Doc

> Security update: browser administration has moved to `/api/business/**` with
> Google-backed Firestore sessions and CSRF. Token-based operations have moved
> to `/api/internal/**` and are available only on the IAM-protected
> `delta-backend-admin` service. The older public admin paths documented below
> are no longer exposed by `delta-backend`. See
> `PLAN_BUSINESS_API_SECURITY_DEPLOYMENT.md` for the authoritative route and
> deployment model.

## Summary

The catalog backend owns public catalog metadata, private PDF storage, public thumbnail storage, customer access sessions, signed PDF preview/download URLs, and admin upload/update/delete workflows.

- Public metadata APIs expose catalog companies, categories, documents, and public `thumbnail_url` values.
- Private PDFs live in `darshanent_catalog_dir` and are never public.
- Public thumbnails live in `darshanent-thumbnail-dir` and are loaded directly by browsers.
- Public catalog identity is slug-based: `company_slug + optional category_slug + document_slug`.
- Admin document identity is a stable `document_id` generated when the document is created.
- Admin users provide company/category/document names; the backend derives every slug and does not accept writable slug fields.
- Customer PDF preview/download requires a valid backend `catalog_access` HttpOnly cookie.
- The frontend restores header login state through `GET /api/catalog/access/me` because the cookie is HttpOnly.
- Admin upload/update/delete is currently protected by `x-backend-admin-token`; the future browser business UI should use a separate backend business session wrapper.
- Contact form messages are stored server-side in Firestore database `client-message-db`, collection `contact_messages`.
- Contact form spam protection is currently origin checks plus rate limits; reCAPTCHA Enterprise is optional and only enforced when `RECAPTCHA_ENTERPRISE_SITE_KEY` is configured.
- Contact-message OTP is planned but not part of the current deployment.
- Backward compatibility is not kept unless a future task explicitly asks for it.

## Implemented Files

- `src/catalog/catalog.controller.ts`
- `src/catalog/catalog.service.ts`
- `src/catalog/catalog-name.utils.ts`
- `src/catalog/migrate-catalog-metadata.ts`
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

# Optional current contact-form CAPTCHA. Leave unset until a production key is created.
RECAPTCHA_ENTERPRISE_PROJECT_ID=deweb-preview1
RECAPTCHA_ENTERPRISE_SITE_KEY=
RECAPTCHA_ENTERPRISE_MIN_SCORE=0.5

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
- `RECAPTCHA_ENTERPRISE_SITE_KEY` is optional for the current deployment. When unset, `POST /api/message` skips CAPTCHA verification and relies on origin checks plus rate limits.
- Production should provide secrets through deployment env/secrets, not frontend values or Postman.

## Message Endpoints
### Post messages endpoints

- Writes one document to Firestore database `client-message-db`, collection `contact_messages`.
- Adds backend-side `created_at`.
- Does not verify email ownership, phone ownership, or OTP in the current deployment.
- Browser requests require the public-site `Origin`.
- In-memory rate limits apply before and after optional CAPTCHA verification.
- `captcha_token` is optional. If `RECAPTCHA_ENTERPRISE_SITE_KEY` is unset, the backend ignores CAPTCHA. If the site key is set, the backend requires a valid reCAPTCHA Enterprise token for action `contact_message`.
- Required fields: `name`, `mobile`, `email`, and `message`.

### Get messages endpoint

- Returns all messages ordered by `created_at` newest first.
- Requires `BACKEND_ADMIN_TOKEN` through `x-backend-admin-token`.
- The browser never accesses Firestore directly.

## GCS Storage

Private PDF object:

```txt
gs://darshanent_catalog_dir/{GCS_CATALOG_PREFIX?}/{company_slug}/{category_slug?}/{uploaded_pdf_file_name}
```

Public thumbnail object:

```txt
gs://darshanent-thumbnail-dir/catalog-thumbnails/v1/{company_slug}/{category_slug?}/{uploaded_pdf_file_base_name}.webp
```

- Uncategorized PDFs and thumbnails are direct children of the company prefix.
- Categorized PDFs and thumbnails include the derived category slug prefix.
- Company/category prefix changes use copy-before-delete because GCS folders are object-name prefixes rather than atomic directories.
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
- Required object metadata: `document_id`, `company_name`, `company_slug`, `document_name`, `document_slug`, `original_file_name`, and `uploaded_at`.
- Categorized objects additionally require matching `category_name` and `category_slug`.
- Public responses use `document_name`; `display_name` is unsupported after metadata migration.
- Document thumbnails mirror the PDF company/category hierarchy under `catalog-thumbnails/v1`.
- Listing accepts only direct company PDFs and one-level category PDFs whose path prefixes match their metadata slugs.
- Deeper PDF paths, non-PDF objects, folder placeholders, missing required snake_case metadata, and camelCase metadata are intentionally unsupported.
- There is no runtime fallback to `display_name` or missing name metadata after migration.

`GET /api/catalog/all` response shape:

```json
{
  "companies": [
    {
      "company_slug": "schneider",
      "company_name": "Schneider",
      "document_count": 1,
      "categories": [
        {
          "category_slug": "industrial-automation",
          "category_name": "Industrial Automation",
          "documents": [
            {
              "document_id": "01J...",
              "company_slug": "schneider",
              "company_name": "Schneider",
              "category_slug": "industrial-automation",
              "category_name": "Industrial Automation",
              "document_slug": "plc-catalog",
              "document_name": "PLC Catalog",
              "thumbnail_url": "https://storage.googleapis.com/darshanent-thumbnail-dir/catalog-thumbnails/v1/schneider/industrial-automation/catalog.webp",
              "metadata": {}
            }
          ]
        }
      ],
      "documents": []
    }
  ]
}
```

- Uncategorized document entries are returned in the company-level `documents` array without category fields.
- Categorized document entries are returned only inside their matching category.

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
- Signed URLs targeting an object that is moved by a category/company update stop working when the old object is deleted.

## Admin Upload API

All admin endpoints currently require:

```http
x-backend-admin-token: <BACKEND_ADMIN_TOKEN>
```

```http
POST /api/catalog/documents
PUT /api/catalog/documents/:document_id
PUT /api/catalog/companies/:company_slug
DELETE /api/catalog/documents/:document_id
```

Create request:

```http
POST /api/catalog/documents
Content-Type: multipart/form-data

company_name=Schneider
category_name=Industrial Automation
document_name=PLC Catalog
file=<PDF binary>
```

Update request:

```http
PUT /api/catalog/documents/:document_id
Content-Type: multipart/form-data

document_name=PLC Catalog 2026
category_name=Industrial Automation
file=<optional PDF binary>
```

The update accepts any one or any combination of `document_name`, `category_name`, and `file`. An explicitly empty `category_name` removes the category; omitted fields remain unchanged.

Company update:

```http
PUT /api/catalog/companies/schneider
Content-Type: application/json

{
  "company_name": "Schneider Electric"
}
```

Delete request:

```http
DELETE /api/catalog/documents/:document_id
```

Implemented behavior:

- Only multipart files with MIME `application/pdf`, a `.pdf` filename, non-empty bytes, and a `%PDF-` signature are accepted.
- Names are whitespace-normalized and slugs are derived by lowercasing, replacing non-ASCII-alphanumeric runs with `-`, and trimming outer hyphens. Input is not URL-decoded.
- Create generates one stable ULID `document_id`, stores the PDF at its company/optional-category path, and uploads a first-page thumbnail at the matching public path.
- Existing company/category slug groups are reused with their canonical stored names.
- Duplicate document slugs within a company and destination PDF/thumbnail path collisions return `409`.
- Document name changes update `document_name` and `document_slug` without renaming the uploaded PDF leaf.
- Category changes move only the selected PDF and thumbnail; empty category moves them to the company root.
- PDF replacement may change the uploaded filename and regenerates the thumbnail while preserving `document_id`.
- Company update rewrites all company metadata and moves all PDFs/thumbnails when the derived slug changes; a matching destination company is merged after collision preflight.
- Moves copy and validate destinations before best-effort source cleanup. Operations are retryable but are not atomic across multiple GCS objects.
- Delete removes the private PDF and its matching public thumbnail.

PDF metadata stored on the object:

```txt
document_id
company_slug
company_name
category_slug
category_name
document_slug
document_name
original_file_name
uploaded_at
```

Thumbnail generation:

- Source: first PDF page.
- Format: WebP.
- Width: 480 px.
- Quality: about 70-72.
- Object metadata: `Content-Type: image/webp`, `Cache-Control: public, max-age=31536000, immutable`.
- Category and company prefixes are included when constructing thumbnail object names and URLs.

## Rate Limiting And Origin Checks

- Browser catalog POST requests require an allowed `Origin`; no-origin local tooling requests are allowed.
- In-memory rate limiting applies to inquiry, Google access, OTP request/verify, signed URL access, downloads, and invalid document selections.
- Contact message submissions require the public-site `Origin` and use IP/contact rate limits. reCAPTCHA Enterprise adds a score check only when configured.
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

- Catalog listing includes valid direct company PDFs and one-level category PDFs with the required snake_case metadata.
- `document_id` remains stable across metadata, category, and PDF updates, but public routes and signed URL requests remain slug-based.
- Public routes and signed URL requests use slugs: `company_slug + optional category_slug + document_slug`.
- Thumbnail URLs use company/category prefixes and the uploaded PDF filename, so category/company moves or replacement filenames change the URL.
- Document/category/company name changes immediately change public slug identity.
- Metadata-only document-name updates keep the private object and thumbnail paths unchanged.
- PDF replacement changes file metadata and thumbnail content while preserving `document_id`.
- Deleting a document removes it from `/api/catalog/all` and `/api/catalog/library` because the backing uploaded PDF object is deleted.
- If `GCS_CATALOG_PUBLIC_ASSET_BUCKET` or `CATALOG_PUBLIC_ASSET_BASE_URL` is missing, thumbnail upload/list display becomes incomplete even though PDF signing can still work.

## Limitations

- `catalog_access` sessions are stored in memory, so backend restarts clear active access before browser cookie expiry.
- OTP challenges and rate limits are stored in memory, so multiple backend instances will not share that state.
- Contact-message CAPTCHA is optional in the current deployment, so automated submissions are limited by origin checks and rate limits until OTP or mandatory CAPTCHA is enabled.
- GCS CORS is not required for direct browser PDF viewing, but it will be needed if the frontend fetches signed PDFs as blobs.
- Replacing a PDF with a different filename changes the derived thumbnail URL.
- GCS multi-object moves are copy-before-delete and cannot be fully atomic; failed source cleanup can temporarily leave duplicate physical objects.
- Persistent audit/reporting storage is not implemented.

## Name Metadata Migration

The idempotent migration command scans only supported PDF object paths. Dry-run is the default; `--apply` is required to write metadata.

Prepare before deploying the new reader:

```bash
npm run catalog:migrate-metadata -- --mode=prepare
npm run catalog:migrate-metadata -- --mode=prepare --apply
```

- Copies legacy `display_name` to `document_name`.
- Derives missing `company_name` from `company_slug`.
- Recomputes `document_slug` from `document_name` and preflights duplicate derived company/document identities before writing.
- Preserves `display_name` so the currently deployed backend continues reading the object.
- Preserves all unrelated custom metadata and reports files that cannot be migrated.

After deploying and verifying the new backend:

```bash
npm run catalog:migrate-metadata -- --mode=cleanup
npm run catalog:migrate-metadata -- --mode=cleanup --apply
```

- Verifies `company_name` and `document_name` exist before removing `display_name`.
- Can be rerun safely; unchanged objects are skipped.
- No category-path migration is required for the current uncategorized catalog.

Thumbnail migration decision:

- Existing documents have no category, so their current thumbnail path `catalog-thumbnails/v1/{company_slug}/{pdf_base}.webp` is already the new uncategorized path.
- Prepare derives names from existing slugs and does not change company slugs, so it does not move company thumbnail prefixes.
- Therefore no one-time thumbnail copy/delete migration is required for current data.
- Future category changes and company slug changes move the matching thumbnail through the normal update endpoints.
- If categorized legacy data is introduced before migration, migrate its PDF and thumbnail together before deploying; the runtime intentionally has no legacy path fallback.

## Production Follow-Ups

- Configure the production Google OAuth client id.
- Decide whether contact-message protection should remain optional, become mandatory reCAPTCHA, or move to OTP before public launch.
- If reCAPTCHA is enabled, create a production score-based web key, grant `backend-api-sa@deweb-preview1.iam.gserviceaccount.com` `roles/recaptchaenterprise.agent`, and deploy both backend and UI with the same site key.
- Enable and verify real OTP delivery before using OTP as a public fallback.
- Add contact-message OTP verification before persisting messages if OTP replaces CAPTCHA.
- Remove or disable temporary master OTP behavior before public production use.
- Choose and configure the final email OTP provider.
- Choose and configure the final WhatsApp OTP provider and approved authentication template.
- Move sessions, OTP challenges, and rate limits to Redis or a database before multi-instance production scaling.
- Persist inquiry/audit records if historical reporting is required.
- Add `Retry-After` headers to rate-limit responses if the UI needs precise cooldown display.
- Add the future business auth wrapper before exposing admin mutation routes to `business-delta-ui`.

## Verification

- Backend startup logs include the listening host/port and local `/api` URL.
- `POST /api/message` succeeds without `captcha_token` when `RECAPTCHA_ENTERPRISE_SITE_KEY` is unset and rate limits allow the request.
- `POST /api/message` requires a valid `captcha_token` when `RECAPTCHA_ENTERPRISE_SITE_KEY` is set.
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
- Create derives the expected slugs from names and returns names, slugs, stable `document_id`, PDF object name, and public `thumbnail_url`.
- PDF replacement preserves `document_id` and may return a new thumbnail URL when the uploaded filename changes.
- Document/category metadata updates preserve `document_id` and relocate objects only when category changes.
- Company rename updates every matching object and reports the previous/new slug, canonical name, moved document count, and merge flag.
- Delete removes the uploaded PDF object and matching public thumbnail.
- Obsolete endpoint shapes and document-id signing payloads are intentionally not documented or supported.
