# Catalog Backend Implementation Doc

Last reviewed: 2026-07-19

> Security update: browser administration has moved to `/api/business/**` with
> Google-backed Firestore sessions and CSRF. Token-based operations have moved
> to `/api/internal/**` and are available only on the IAM-protected
> `delta-backend-admin` service. The older public admin mutation paths
> were removed by the earlier business-security implementation and were not
> changed by the 2026-07-19 OTP hardening pass. This document and
> `BACKEND_DEPLOYMENT_DOC.md` describe the current route and deployment model.

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
- Browser administration is implemented under `/api/business/**` with Google-backed Firestore sessions, exact business-origin checks, and CSRF on state-changing requests.
- Operator/Postman administration is implemented under `/api/internal/**`; it is enabled only when `INTERNAL_ADMIN_API_ENABLED=true` and still requires `x-backend-admin-token`.
- Contact form messages are stored server-side in Firestore database `client-message-db`, collection `contact_messages`.
- Contact form spam protection is exact public-origin checks, Firestore-backed rate limits, DTO whitelisting, and optional reCAPTCHA Enterprise when `RECAPTCHA_ENTERPRISE_SITE_KEY` is configured.
- Contact-message OTP is planned but not part of the current deployment.
- Backward compatibility is not kept unless a future task explicitly asks for it.

## 2026-07-19 Security Hardening

This security pass preserved every existing endpoint and retained the real
email and WhatsApp OTP implementation. It made these changes:

- Removed the fixed `190399` shortcut, `createMasterOtpAccess`, master-code
  acceptance during challenge verification, direct access-session creation
  from a request-OTP payload, and the `CATALOG_MASTER_OTP_CODE` and
  `CATALOG_DEV_OTP_CODE` configuration paths.
- `POST /api/catalog/access/request-otp` now accepts inquiry/contact/channel
  fields only. Global DTO validation rejects an unexpected `otp` property.
- Every OTP is generated with `node:crypto`, hashed with its challenge ID and
  normalized contact, expires, is contact-bound, and obeys the existing
  maximum-attempt lock. A verified challenge is deleted and cannot be replayed.
- SES, ZeptoMail, Meta WhatsApp, and configurable HTTP WhatsApp delivery remain
  supported. Non-production log delivery prints a newly generated random OTP.
  Production fails with `503` if delivery is disabled or the selected provider
  is incomplete; it never falls back to a shared code.
- `POST /api/catalog/documents/access` now requires a valid
  `catalog_access` cookie before it resolves or signs a private PDF.
- Added `POST /api/catalog/access/logout`; it revokes the in-memory catalog
  session and clears the cookie without replacing any existing route.
- `POST /api/message` and its request DTO are unchanged. The retained challenge
  service may be reused for future mobile verification, but that future work
  must not add a universal OTP.
- Added Fastify security headers with `@fastify/helmet`; authenticated catalog
  and business responses remain `Cache-Control: no-store`.
- `delta-backend-admin` uses the dedicated
  `backend-admin-api-sa@deweb-preview1.iam.gserviceaccount.com` runtime identity.
  `BACKEND_ADMIN_TOKEN` Secret Manager access was removed from the public
  backend identity and granted only to the dedicated admin identity.
- Tests assert fixed-code rejection, request DTO rejection, provider delivery,
  contact binding, expiry, lockout, replay prevention, catalog session guarding,
  logout, business allowlisting/disabled users, CSRF, and registration of all
  existing routes.

Google Cloud and Firebase identify the production project as follows:

```text
Display name: deweb1
Project ID: deweb-preview1
Project number: 157686675107
```

`deweb1` and `deweb-preview1` are the same project. The business UI OAuth Web
client ID begins with project number `157686675107`, and its Authorized
JavaScript Origins must include exactly
`https://business.darshanent.co.in`.

## Implemented Files

- `src/catalog/catalog.controller.ts`
- `src/catalog/catalog.service.ts`
- `src/catalog/catalog-name.utils.ts`
- `src/catalog/catalog-access.service.ts`
- `src/catalog/catalog-rate-limiter.service.ts`
- `src/catalog/catalog-access.guard.ts`
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
- `src/business/business-auth.controller.ts`
- `src/business/business-auth.service.ts`
- `src/business/business-auth.guard.ts`
- `src/business/business-csrf.guard.ts`
- `src/business/business-session-cookie.ts`
- `src/business/business-auth.store.ts`
- `src/business/business-authorization.provider.ts`
- `src/business/business-catalog.controller.ts`
- `src/business/business-message.controller.ts`
- `src/internal/internal-admin.guard.ts`
- `src/internal/internal-catalog.controller.ts`
- `src/internal/internal-message.controller.ts`
- `src/security/origin.guards.ts`
- `src/security/service-boundary.guard.ts`
- `src/security/no-store.interceptor.ts`
- `src/security/security-audit.service.ts`
- `src/message/message.controller.ts`
- `src/message/message.service.ts`
- `src/message/message-rate-limiter.service.ts`
- `src/message/recaptcha-enterprise.service.ts`
- `src/message/dto/create-message.dto.ts`
- `src/message/message.controller.spec.ts`
- `src/message/message.service.spec.ts`
- `postman/delta-backend-catalog-gcs.postman_collection.json`

## Environment

```env
HOST=0.0.0.0
PORT=3000
PUBLIC_FRONTEND_ORIGIN=https://darshanent.co.in,https://www.darshanent.co.in
BUSINESS_FRONTEND_ORIGIN=https://business.darshanent.co.in
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
BUSINESS_UI_GOOGLE_CLIENT_ID=google-web-client-id.apps.googleusercontent.com
BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=admin@example.com
BUSINESS_UI_ALLOWED_GOOGLE_SUBS=
BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN=darshanent.co.in
BUSINESS_UI_CSRF_SECRET=at-least-32-random-characters
FIRESTORE_DATABASE_ID=client-message-db
INTERNAL_ADMIN_API_ENABLED=false
INTERNAL_ADMIN_SERVICE_ONLY=false

# Optional current contact-form CAPTCHA. Leave unset until a production key is created.
RECAPTCHA_ENTERPRISE_PROJECT_ID=deweb-preview1
RECAPTCHA_ENTERPRISE_SITE_KEY=
RECAPTCHA_ENTERPRISE_MIN_SCORE=0.5

CATALOG_OTP_TTL_SECONDS=600
CATALOG_OTP_RESEND_AFTER_SECONDS=60
CATALOG_OTP_MAX_ATTEMPTS=5
CATALOG_OTP_DELIVERY_ENABLED=true
```

- `PORT` defaults to `3000`; startup logs show both the bind URL and local URL.
- `CATALOG_UPLOAD_MAX_BYTES` defaults to 100 MB when unset.
- `CATALOG_SIGNED_URL_TTL_SECONDS` defaults to 900 seconds when unset.
- `CATALOG_ACCESS_TTL_SECONDS` defaults to 180 days when unset.
- Provider-specific OTP env vars are supported for SES, ZeptoMail, Meta Cloud API, and generic HTTP WhatsApp providers.
- `CATALOG_MASTER_OTP_CODE` and `CATALOG_DEV_OTP_CODE` are intentionally not
  supported. Local development uses a newly generated random OTP through the
  log provider.
- `BUSINESS_UI_CSRF_SECRET` is required for business auth responses and must contain at least 32 characters.
- `RECAPTCHA_ENTERPRISE_SITE_KEY` is optional for the current deployment. When unset, `POST /api/message` skips CAPTCHA verification and relies on origin checks plus rate limits.
- Public service deployments should set `INTERNAL_ADMIN_API_ENABLED=false`, `INTERNAL_ADMIN_SERVICE_ONLY=false`, and remove `BACKEND_ADMIN_TOKEN`.
- Admin service deployments should set `INTERNAL_ADMIN_API_ENABLED=true`, `INTERNAL_ADMIN_SERVICE_ONLY=true`, and expose `BACKEND_ADMIN_TOKEN` only through Secret Manager.
- Production should provide secrets through deployment env/secrets, not frontend values or Postman.

## Business API Security

Implemented browser business routes:

```http
POST /api/business/auth/google
GET /api/business/auth/me
POST /api/business/auth/logout
GET /api/business/messages
GET /api/business/catalog/all
POST /api/business/catalog/documents
POST /api/business/catalog/documents/access
PUT /api/business/catalog/documents/:document_id
PUT /api/business/catalog/companies/:company_slug
DELETE /api/business/catalog/documents/:document_id
```

- Every business route requires the exact configured business `Origin`.
- Google login verifies the ID token audience against `BUSINESS_UI_GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_ID`.
- Accepted identities must be in `BUSINESS_UI_ALLOWED_GOOGLE_EMAILS`.
- Gmail accounts are accepted by exact email allowlist.
- `@darshanent.co.in` accounts must also carry Google's verified `hd=darshanent.co.in` claim.
- Other non-Gmail/non-Workspace accounts require an immutable subject in `BUSINESS_UI_ALLOWED_GOOGLE_SUBS`.
- First successful login binds `business_users/{sub}` to the accepted email in Firestore.
- Every restored session rechecks the environment allowlist, Firestore user status, email binding, and original subject.
- Production business session cookie name is `__Host-business_session`.
- Session tokens are 32-byte opaque values; only the SHA-256 token hash is stored in Firestore collection `business_sessions`.
- Business sessions have a 30-day absolute lifetime, seven-day idle timeout, 24-hour rotation, and a maximum of five active sessions per Google subject.
- Login and `/auth/me` return a CSRF token derived from the session token and `BUSINESS_UI_CSRF_SECRET`.
- Logout and all business catalog mutations require `X-CSRF-Token`.
- Business auth and message/catalog responses use `NoStoreInterceptor`.

Implemented operator/internal routes:

```http
GET /api/internal/messages
POST /api/internal/catalog/documents
PUT /api/internal/catalog/documents/:document_id
PUT /api/internal/catalog/companies/:company_slug
DELETE /api/internal/catalog/documents/:document_id
```

- Internal routes return `404` unless `INTERNAL_ADMIN_API_ENABLED=true`.
- Internal routes reject browser requests with an `Origin` header.
- Internal routes require `x-backend-admin-token`, compared with `BACKEND_ADMIN_TOKEN` using a timing-safe comparison.
- When `INTERNAL_ADMIN_SERVICE_ONLY=true`, the app returns `404` for every route except `/api/internal/**` and `/api/health`.

## Message Endpoints
### Post messages endpoints

- Writes one document to Firestore database `client-message-db`, collection `contact_messages`.
- Adds backend-side `created_at`.
- Does not verify email ownership, phone ownership, or OTP in the current deployment.
- Browser requests require the public-site `Origin`.
- Firestore-backed rate limits apply by hashed IP key and hashed normalized email/mobile key.
- Current limits are at most five submissions per IP per hour and at most one submission per normalized email/mobile pair every ten minutes.
- `captcha_token` is optional. If `RECAPTCHA_ENTERPRISE_SITE_KEY` is unset, the backend ignores CAPTCHA. If the site key is set, the backend requires a valid reCAPTCHA Enterprise token for action `contact_message`.
- Required fields: `name`, `mobile`, `email`, and `message`.
- DTO validation whitelists expected fields, rejects unexpected fields, and enforces maximum lengths.

### Get messages endpoint

- Returns all messages ordered by `created_at` newest first.
- Browser dashboard access is through `GET /api/business/messages` with business session auth.
- Operator access is through `GET /api/internal/messages` with Cloud Run IAM at the service layer and `x-backend-admin-token` at the app layer.
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

- Verifies the Google ID token audience against `GOOGLE_CLIENT_ID`.
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
- Intended for the `delta-ui` Header restore flow after refresh/revisit once
  that repository integrates the backend catalog API.
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
- OTP requests fail with `503` unless `CATALOG_OTP_DELIVERY_ENABLED=true`.
- OTP codes are randomly generated per challenge and are never accepted by the request endpoint.
- Production OTP requests fail closed when delivery is disabled or the selected provider is incomplete.
- The OTP challenge service is retained for future message/mobile verification; `POST /api/message` is unchanged.

Logout:

```http
POST /api/catalog/access/logout
```

- Revokes the current in-memory catalog session when present.
- Clears the `catalog_access` cookie using the same path and security
  attributes.
- Requires the configured public-site Origin for browser requests.
- Returns `{ "ok": true }` even when no live session exists.

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

## Business And Internal Mutation APIs

Business mutation endpoints require an exact business `Origin`, a valid
`__Host-business_session`, and `X-CSRF-Token`.

Internal mutation endpoints require `INTERNAL_ADMIN_API_ENABLED=true`, no
browser `Origin`, and:

```http
x-backend-admin-token: <BACKEND_ADMIN_TOKEN>
```

```http
POST /api/business/catalog/documents
PUT /api/business/catalog/documents/:document_id
PUT /api/business/catalog/companies/:company_slug
DELETE /api/business/catalog/documents/:document_id

POST /api/internal/catalog/documents
PUT /api/internal/catalog/documents/:document_id
PUT /api/internal/catalog/companies/:company_slug
DELETE /api/internal/catalog/documents/:document_id
```

Create request:

```http
POST /api/business/catalog/documents
Content-Type: multipart/form-data

company_name=Schneider
category_name=Industrial Automation
document_name=PLC Catalog
file=<PDF binary>
```

Update request:

```http
PUT /api/business/catalog/documents/:document_id
Content-Type: multipart/form-data

document_name=PLC Catalog 2026
category_name=Industrial Automation
file=<optional PDF binary>
```

The update accepts any one or any combination of `document_name`, `category_name`, and `file`. An explicitly empty `category_name` removes the category; omitted fields remain unchanged.

Company update:

```http
PUT /api/business/catalog/companies/schneider
Content-Type: application/json

{
  "company_name": "Schneider Electric"
}
```

Delete request:

```http
DELETE /api/business/catalog/documents/:document_id
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
- Contact message submissions require the public-site `Origin` and use Firestore-backed IP/contact rate limits. reCAPTCHA Enterprise adds a score check only when configured.
- Business API requests require the exact business-site `Origin`; state-changing requests also require CSRF.
- Internal API requests reject browser `Origin` headers.
- Unknown browser origins are not treated as CORS server errors; route origin guards return clean `403` responses for blocked origins.
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
- Business sessions are persisted in Firestore and are multi-instance safe.
- Contact-message CAPTCHA is optional in the current deployment, so automated submissions are limited by origin checks and rate limits until OTP or mandatory CAPTCHA is enabled.
- GCS CORS is not required for direct browser PDF viewing, but it will be needed if the frontend fetches signed PDFs as blobs.
- Replacing a PDF with a different filename changes the derived thumbnail URL.
- GCS multi-object moves are copy-before-delete and cannot be fully atomic; failed source cleanup can temporarily leave duplicate physical objects.
- Persistent audit/reporting storage is not implemented.
- Security audit events are emitted through Nest logging, not stored in a queryable audit table.
- Firestore TTL fields are written for `business_sessions.expires_at` and `message_rate_limits.expires_at`, but TTL policies are external GCP configuration.

## Production Follow-Ups

### `delta-backend`

- Update `scripts/deploy-gcp.sh` to match the hardened plan once `/api` is served by a verified load balancer: use `--ingress internal-and-cloud-load-balancing` and `--no-default-url` for `delta-backend`.
- Keep `scripts/deploy-gcp.sh` from leaving `RECAPTCHA_ENTERPRISE_SITE_KEY` empty in production if CAPTCHA is mandatory for contact messages.
- Deploy `delta-backend-admin` separately with Cloud Run IAM and `INTERNAL_ADMIN_SERVICE_ONLY=true` when operator internal routes are needed.
- Keep `delta-backend-admin` attached to the existing dedicated
  `backend-admin-api-sa` identity; do not grant the public backend identity
  access to `BACKEND_ADMIN_TOKEN`.
- Enable Firestore TTL policies for `business_sessions.expires_at` and `message_rate_limits.expires_at`.
- Route `/api` and `/api/*` through an external Application Load Balancer rather than Firebase Hosting rewrites, because Firebase Hosting passes only the `__session` cookie to Cloud Run.
- Add Cloud Armor policies for Google-login abuse and contact-message abuse once traffic goes through the load balancer.
- Configure the production Google OAuth client id for customer and business Google token verification.
- Decide whether contact-message protection should remain optional, become mandatory reCAPTCHA, or move to OTP before public launch.
- If reCAPTCHA is enabled, create a production score-based web key, grant `backend-api-sa@deweb-preview1.iam.gserviceaccount.com` `roles/recaptchaenterprise.agent`, and deploy the backend with the site key.
- Enable and verify real OTP delivery before using OTP as a public fallback.
- Add contact-message OTP verification before persisting messages if OTP replaces CAPTCHA.
- Keep OTP challenge delivery reusable for future message/mobile verification without adding a shared or master code.
- Choose and configure the final email OTP provider.
- Choose and configure the final WhatsApp OTP provider and approved authentication template.
- Move catalog customer sessions, OTP challenges, and catalog rate limits to Redis or a database before multi-instance production scaling.
- Keep Cloud Run capped at one public instance until catalog customer sessions, OTP challenges, and catalog rate limits move out of process memory.
- Persist inquiry/audit records if historical reporting is required.
- Add `Retry-After` headers to rate-limit responses if the UIs need precise cooldown display.
- After verification, remove obsolete public admin routing and revoke obsolete service URLs or tokens.
- Replace the environment allowlist with Google Workspace group membership when `delta-business-admins@darshanent.co.in` is ready.

### `delta-ui`

- Configure the public frontend build with `VITE_API_BASE_URL=https://darshanent.co.in/api`.
- Configure the public frontend build with `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` when contact-message CAPTCHA is enabled.
- No immediate code change is required for the current `delta-ui` repository:
  it does not yet call `/api/message`, catalog access, OTP, session lookup,
  logout, or signed-document endpoints.
- A source compatibility review found only placeholder `dummyjson.com` fetches
  in the current `delta-ui`; none of the backend contracts changed by this
  security pass are consumed there.
- When catalog OTP is integrated, first call
  `POST /api/catalog/access/request-otp` without an `otp` field, then submit the
  returned `challenge_id`, matching contact, and user-entered `otp` to
  `POST /api/catalog/access/verify-otp`, always with
  `credentials: "include"`.
- Use `POST /api/catalog/access/logout` to end catalog access and treat `401`
  from signed document access or `/api/catalog/access/me` as a signed-out
  session.
- Update contact-message UI behavior after the backend decision between optional CAPTCHA, mandatory reCAPTCHA, or OTP.
- If OTP is added to mobile/contact verification later, define the message
  verification contract first and reuse the challenge service. The current
  `POST /api/message` payload must remain unchanged until that separate backend
  work is implemented.
- Use `Retry-After` headers for precise cooldown display once the backend emits them.
- Redeploy the public UI after API base URL, CAPTCHA, or OTP environment changes so old bundles are replaced.

### `business-delta-ui`

- Configure the business frontend build with `VITE_API_BASE_URL=https://darshanent.co.in/api`.
- In Google Cloud project ID `deweb-preview1` (display name `deweb1`), confirm
  `https://business.darshanent.co.in` is present in the existing OAuth Web
  client's Authorized JavaScript Origins before production use.
- The `business-delta-ui` Firebase Hosting site and custom domain are attached;
  wait for the custom domain to finish TLS certificate minting and report
  `Connected` before running the verified UI deployment.
- Delete any old frontend admin-token environment variables and redeploy the business UI so stale bundles do not retain token-based admin behavior.
- Require two-step verification for dashboard administrators.
- Use backend business session auth only; do not store or send `BACKEND_ADMIN_TOKEN` from the browser.
- Use `Retry-After` headers for precise cooldown display once the backend emits them.

## Verification

- Backend startup logs include the listening host/port and local `/api` URL.
- `POST /api/message` succeeds without `captcha_token` when `RECAPTCHA_ENTERPRISE_SITE_KEY` is unset and rate limits allow the request.
- `POST /api/message` requires a valid `captcha_token` when `RECAPTCHA_ENTERPRISE_SITE_KEY` is set.
- `POST /api/message` with a blocked `Origin` returns `403`, not a CORS-layer `500`.
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
- The fixed value `190399` has no special behavior.
- Supplying `otp` to `POST /api/catalog/access/request-otp` is rejected.
- Expired, locked, replayed, and contact-mismatched challenges fail.
- `POST /api/catalog/access/logout` revokes the session and clears the catalog
  cookie.
- Business Google login sets the production `__Host-business_session` cookie and returns a CSRF token.
- `GET /api/business/auth/me` restores a valid business session and rotates it when needed.
- `POST /api/business/auth/logout` requires CSRF, revokes the session, and clears the cookie.
- Business catalog mutations require both a valid business session and `X-CSRF-Token`.
- `/api/internal/**` returns `404` on the public service when `INTERNAL_ADMIN_API_ENABLED=false`.
- The admin-only service returns `404` for non-internal routes when `INTERNAL_ADMIN_SERVICE_ONLY=true`.
- Internal operator routes reject requests with browser `Origin` headers and require `x-backend-admin-token`.
- Create derives the expected slugs from names and returns names, slugs, stable `document_id`, PDF object name, and public `thumbnail_url`.
- PDF replacement preserves `document_id` and may return a new thumbnail URL when the uploaded filename changes.
- Document/category metadata updates preserve `document_id` and relocate objects only when category changes.
- Company rename updates every matching object and reports the previous/new slug, canonical name, moved document count, and merge flag.
- Delete removes the uploaded PDF object and matching public thumbnail.
- Obsolete endpoint shapes and document-id signing payloads are intentionally not documented or supported.

On 2026-07-19, ESLint, the Nest production build, 58 unit tests, two Fastify
end-to-end route tests, Git diff whitespace checks, and the production runtime
dependency audit all passed. The runtime audit reported zero vulnerabilities.
