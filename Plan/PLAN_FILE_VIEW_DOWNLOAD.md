# Catalog View And Download Implementation

## Summary

The catalog view/download flow is implemented through backend APIs. The frontend and Postman do not talk to the private PDF bucket directly.

- Public metadata endpoints return companies, nested catalog navigation, document metadata, and public thumbnail URLs.
- Public thumbnails are loaded directly from `darshanent-thumbnail-dir`.
- Private PDFs stay in `darshanent_catalog_dir` and require short-lived signed URLs.
- Signed PDF URL generation uses slugs, not `document_id`.
- Backward compatibility is not kept unless a future task explicitly asks for it.

## Environment And Storage

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
CATALOG_EMAIL_OTP_PROVIDER=zeptomail # log | ses | zeptomail
CATALOG_EMAIL_FROM=catalog@example.com
CATALOG_EMAIL_FROM_NAME=Catalog Access
CATALOG_ZEPTOMAIL_TOKEN=zoho-enczapikey-value
AWS_REGION=ap-south-1
CATALOG_WHATSAPP_OTP_PROVIDER=meta # log | meta | http
CATALOG_WHATSAPP_TEMPLATE_NAME=catalog_access_otp
CATALOG_WHATSAPP_TEMPLATE_LANGUAGE=en_US
CATALOG_WHATSAPP_META_PHONE_NUMBER_ID=1234567890
CATALOG_WHATSAPP_META_ACCESS_TOKEN=meta-token
CATALOG_WHATSAPP_HTTP_URL=https://provider.example/whatsapp/send
CATALOG_WHATSAPP_HTTP_AUTH_HEADER=authkey
CATALOG_WHATSAPP_HTTP_AUTH_VALUE=provider-token
CATALOG_WHATSAPP_HTTP_BODY={"to":"{{mobile_e164}}","otp":"{{otp}}","template":"{{template_name}}","language":"{{language}}"}
FRONTEND_ORIGIN=http://localhost:5173
GOOGLE_APPLICATION_CREDENTIALS=/Users/darshankapadiya/.gcp/catalog-api-sa.json
```

PDF objects:

```txt
gs://darshanent_catalog_dir/{GCS_CATALOG_PREFIX?}/{company_slug}/{uploaded_pdf_file_name}
```

Thumbnail objects:

```txt
gs://darshanent-thumbnail-dir/catalog-thumbnails/v1/{company_slug}/{uploaded_pdf_file_base_name}.webp
```

The backend service account reads/lists/signs PDFs from `darshanent_catalog_dir` and writes thumbnails to `darshanent-thumbnail-dir`. Public users only need read/view access to `darshanent-thumbnail-dir`.

## Public Metadata API

```http
POST /api/catalog/library
GET /api/catalog/all
```

`POST /api/catalog/library` accepts selected company slugs:

```json
{
  "company_slugs": ["schneider", "polycab"]
}
```

It returns company metadata, document examples, and all public thumbnail URLs needed for that library view.

`GET /api/catalog/all` returns all companies, optional categories, documents, metadata, and public thumbnail URLs needed for navigation/catalog display.

Document summaries include:

```json
{
  "document_id": "01J...",
  "company_slug": "schneider",
  "category_slug": "industrial-automation",
  "document_slug": "plc-catalog",
  "display_name": "PLC Catalog",
  "thumbnail_url": "https://storage.googleapis.com/darshanent-thumbnail-dir/catalog-thumbnails/v1/schneider/plc-catalog.webp",
  "metadata": {
    "size": 123456,
    "sizeLabel": "120.6 KB",
    "contentType": "application/pdf",
    "createdAt": "2026-06-19T00:00:00.000Z",
    "updatedAt": "2026-06-19T00:00:00.000Z",
    "updatedLabel": "19 Jun 2026"
  }
}
```

Frontend route shape:

```txt
/catalog/:company_slug/:document_slug
/catalog/:company_slug/:category_slug/:document_slug
```

## Access And Signed PDF API

Implemented endpoints:

```http
POST /api/catalog/access
POST /api/catalog/access/google
POST /api/catalog/access/request-otp
POST /api/catalog/access/verify-otp
POST /api/catalog/documents/access
```

Current behavior:

- `POST /api/catalog/access` records inquiry details only and does not set `catalog_access`.
- `POST /api/catalog/access/google` verifies a Google ID token and sets the HttpOnly `catalog_access` cookie.
- `POST /api/catalog/access/request-otp` records inquiry details and creates an in-memory OTP challenge for `whatsapp` or `email`.
- `POST /api/catalog/access/verify-otp` verifies the challenge, creates an in-memory `catalog_access` session, and sets the HttpOnly cookie.
- `POST /api/catalog/documents/access` requires the `catalog_access` cookie and returns a slug-resolved signed PDF URL.
- OTP delivery is currently disabled unless `CATALOG_OTP_DELIVERY_ENABLED=true`.
- The temporary master OTP defaults to `190399` unless `CATALOG_MASTER_OTP_CODE` is set.
- Email OTP delivery supports SES or ZeptoMail when delivery is re-enabled through env configuration.
- WhatsApp OTP delivery supports Meta Cloud API or a generic HTTP provider payload for MSG91/Gupshup/Interakt-style BSP APIs when delivery is re-enabled.

Implemented files:

- `src/catalog/catalog-access.service.ts`
- `src/catalog/catalog.controller.ts`
- `src/catalog/dto/catalog-google-access.dto.ts`
- `src/catalog/dto/catalog-otp-request.dto.ts`
- `src/catalog/dto/catalog-verify-otp.dto.ts`
- `src/catalog/catalog.controller.spec.ts`

`POST /api/catalog/access/google` verifies the Google ID token audience against `CATALOG_GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_ID`. It requires a verified Google email and sets `catalog_access`.

```json
{
  "id_token": "google-id-token-from-frontend"
}
```

Response:

```json
{
  "ok": true,
  "auth_provider": "google",
  "email": "customer@gmail.com",
  "name": "Customer Name",
  "expires_at": "2026-07-19T00:00:00.000Z"
}
```

`POST /api/catalog/access/request-otp` records the inquiry and creates a short-lived OTP challenge. Current temporary behavior does not send a provider OTP; verify with the master OTP `190399`.

Temporary shortcut: if `otp: "190399"` is included in the request body, the backend verifies immediately and sets `catalog_access` without creating a challenge.

WhatsApp request:

```json
{
  "name": "Customer Name",
  "mobile": "9999999999",
  "email": "optional@example.com",
  "message": "optional message",
  "channel": "whatsapp",
  "otp": "190399"
}
```

Email request:

```json
{
  "name": "Customer Name",
  "email": "customer@gmail.com",
  "message": "optional message",
  "channel": "email"
}
```

Response:

```json
{
  "ok": true,
  "challenge_id": "01J...",
  "channel": "whatsapp",
  "expires_at": "2026-06-19T10:10:00.000Z",
  "resend_after_seconds": 60
}
```

`POST /api/catalog/access/verify-otp` verifies the OTP. Only this endpoint creates the backend `catalog_access` session and sets the HttpOnly cookie.

```json
{
  "challenge_id": "01J...",
  "mobile": "9999999999",
  "otp": "190399"
}
```

For email OTP verification, send `email` instead of `mobile`.

Response:

```json
{
  "ok": true,
  "expires_at": "2026-07-19T00:00:00.000Z"
}
```

`POST /api/catalog/documents/access` requires the `catalog_access` cookie and resolves the selected document by slugs:

```json
{
  "company_slug": "schneider",
  "category_slug": "industrial-automation",
  "document_slug": "plc-catalog",
  "action": "preview"
}
```

`category_slug` is optional. `action` must be `preview` or `download`.

Response:

```json
{
  "document_id": "01J...",
  "url": "https://storage.googleapis.com/...",
  "expires_at": "2026-06-19T10:45:00.000Z",
  "ttl_seconds": 900,
  "file_name": "PMS_Metering.pdf"
}
```

The browser/PDF viewer loads the returned signed URL directly. No backend PDF proxy endpoint is required.

## Thumbnail Strategy

- `thumbnail_url` values are included directly in `/api/catalog/library` and `/api/catalog/all`.
- Thumbnail URLs point to public/open WebP objects in `darshanent-thumbnail-dir`.
- Thumbnails are document-level only; company records do not expose `thumbnail_url`.
- Thumbnails are never signed, never proxied, and never embedded as base64 in JSON.
- Loading up to about 100 thumbnails is acceptable when images are small WebP files, served from the public bucket/CDN with long cache headers, and lazy-loaded in the UI.
- Recommended browser behavior: use normal `<img loading="lazy">` or equivalent lazy image loading.

## Security And Limits

- PDFs remain private and are accessed only through short-lived V4 signed URLs.
- Preview uses `inline` content disposition.
- Download uses `attachment` content disposition.
- `CATALOG_SIGNED_URL_TTL_SECONDS` defaults to 900 seconds.
- Catalog POST endpoints check browser `Origin` against `FRONTEND_ORIGIN`.
- Requests without an `Origin` header are allowed for Postman/curl local testing.
- `catalog_access` sessions and rate limits are currently in memory.
- CORS and origin checks are browser controls, not full authentication.
- Zero-trust rule: backend must not trust localStorage, hidden fields, frontend route state, or any client-provided access flag.
- The only valid access proof is a backend-issued `catalog_access` HttpOnly cookie mapped to a valid backend session.

## Implementation Details

Backend behavior:

- `GET /api/catalog/all` lists objects from `GCS_CATALOG_BUCKET` using optional `GCS_CATALOG_PREFIX`.
- Listing ignores folder placeholders, nested PDFs, non-PDF objects, and objects missing required snake_case catalog metadata.
- Required PDF metadata for listing: `document_id`, `company_slug`, `document_slug`, and `display_name`.
- Optional PDF metadata: `category_slug`, `company_name`, `category_name`, `original_file_name`, and `uploaded_at`.
- `POST /api/catalog/library` builds from the same catalog listing and filters by requested company slugs.
- Document thumbnails are derived from `company_slug + uploaded PDF file base name`.
- `POST /api/catalog/documents/access` slugifies input slugs, finds the matching document metadata, and signs the resolved private uploaded PDF object.
- Signed URL responses include the current resolved `document_id`; callers must treat it as response metadata, not as the public route key.
- Signed URL `responseDisposition` is `inline` for `preview` and `attachment` for `download`.
- Signed URL `responseType` is `application/pdf`.

Upload-driven constraints:

- Upload writes private PDFs directly under the company folder using the uploaded PDF filename.
- PDF replacement creates a new ULID `document_id`, so cached frontend metadata should refresh after replacement.
- Metadata-only update keeps `document_id`; frontend can update labels/categories without forcing PDF access refresh.
- Public thumbnails use the uploaded PDF base filename; replacing with a differently named PDF changes the thumbnail URL and removes the old thumbnail.
- Deleted documents disappear from public metadata because the private uploaded PDF object is removed.
- Nested legacy object names, missing snake_case metadata, and camelCase metadata are intentionally unsupported.

Runtime components:

- GCS access uses `new Storage()` from `@google-cloud/storage`.
- Local auth uses Application Default Credentials from `GOOGLE_APPLICATION_CREDENTIALS`.
- Cloud Run should use an attached service account instead of a JSON key.
- The service account needs object list/read/sign capability on `darshanent_catalog_dir`.
- The same service account needs write/edit capability on `darshanent-thumbnail-dir` for upload workflows.
- If Cloud Run signing uses IAM instead of a local key, grant the runtime identity `roles/iam.serviceAccountTokenCreator` where required for `signBlob`.

## Rules

- Do not pass `document_id` to generate signed PDF URLs.
- Do not use PDF filenames, spaces, or GCS object paths as public catalog identity.
- Do not add backward-compatible endpoint aliases, DTO fallbacks, or old request examples unless explicitly requested.
- Do not add a thumbnail signing flow.
- Do not expose Google credentials to frontend or Postman.

## Detailed TODOs

### OTP Access Control

Current:

- `POST /api/catalog/access` is inquiry-only and no longer creates a cookie.
- `POST /api/catalog/access/google` validates Google ID tokens and creates `catalog_access` sessions for verified Google emails.
- OTP challenges, verified sessions, and audit records are currently in memory.
- OTP challenge state stores challenge id, channel, contact key, mobile/email, hashed OTP, attempt count, resend count, expiry, IP, user agent, and inquiry fields.
- OTP fallback channels are `whatsapp` and `email`.
- OTP delivery is temporarily disabled; users verify with the master OTP `190399`.
- `request-otp` can immediately grant access when the request includes the master OTP.
- Wrong OTP attempts do not set cookies and lock the challenge at the configured attempt limit.
- Successful OTP verification sets `catalog_access` with `HttpOnly`, `SameSite=Lax`, `Path=/api/catalog`, and `Secure` in production.

Implemented:

- `POST /api/catalog/access/google`.
- `POST /api/catalog/access/request-otp`.
- `POST /api/catalog/access/verify-otp`.
- Inquiry-only `POST /api/catalog/access`.
- Google ID token verification with `google-auth-library`.
- SES and ZeptoMail email OTP delivery adapters.
- Meta Cloud API and generic HTTP WhatsApp OTP delivery adapters.
- Temporary disabled-delivery master OTP mode using `CATALOG_MASTER_OTP_CODE`, default `190399`.
- Temporary one-request master OTP shortcut on `POST /api/catalog/access/request-otp`.
- In-memory audit records for request and verification attempts.
- Server-side OTP verification only; no frontend-provided access flag is trusted.

Remaining production TODO:

- Configure the production Google OAuth client id.
- Replace temporary master OTP mode with real delivery before public launch.
- Choose and configure email provider: `ses` or `zeptomail`.
- Choose and configure WhatsApp provider: `meta` direct or `http` for MSG91/Gupshup/Interakt-style BSP APIs.
- Approve the WhatsApp authentication template before production traffic.
- Verify SES/ZeptoMail sender domain DNS and production sending permissions.
- Persist inquiry/audit records in a database if historical reporting is required.
- Move challenges and access sessions to Redis or a database before multi-instance production scaling.

Cookie requirements:

- Name: `catalog_access`.
- Value: random opaque high-entropy token.
- Attributes: `HttpOnly`, `SameSite=Lax`, `Path=/api/catalog`, `Secure` in production.
- JavaScript must not be able to read the cookie.

Acceptance:

- Unexpected browser origin is blocked.
- Google sign-in sets `catalog_access` only after backend token verification.
- Requesting OTP does not set `catalog_access`.
- Wrong OTP does not set `catalog_access`.
- Expired challenge cannot be verified.
- Too many OTP attempts locks or throttles the challenge.
- Successful WhatsApp or email OTP verification sets `catalog_access`.
- `/api/catalog/documents/access` succeeds only after Google sign-in or successful OTP verification.
- Access grants survive backend restart if session persistence is implemented.

### Session Persistence

Current:

- `catalog_access` sessions are stored in memory.
- Restarting the backend clears all access sessions.
- Multiple backend instances do not share sessions.
- This is acceptable for the current low-traffic phase because cross-device and restart persistence are not required.

Current decision:

- Do not add Redis or DB-backed session persistence yet.
- Keep the backend `catalog_access` session in memory for now.
- Keep OTP challenges in memory for now because traffic is low and cross-device/restart persistence is not required.
- Use browser localStorage only for UI convenience, such as remembering form fields, selected company, last opened slugs, or whether the OTP flow was recently completed.
- Do not store OTPs, raw access tokens, signed PDF URLs, service credentials, or private PDF identifiers in localStorage.
- Keep the real access signal as the backend-issued `HttpOnly` cookie.

Later implement when traffic/scaling requires it:

- Move access sessions to Redis or a database before production scaling.
- Move OTP challenges to Redis or a database before multi-instance deployment.
- Store token hash, expiry, inquiry/customer reference, created IP, user agent, and revoked timestamp.
- Reject expired or revoked sessions before signing PDFs.

Recommended Redis shape:

```txt
catalog:access:{token_hash} -> JSON session
catalog:otp:{challenge_id} -> JSON OTP challenge
TTL: same as catalog_access cookie expiry
OTP TTL: 5-10 minutes
```

Example value:

```json
{
  "session_id": "01J...",
  "token_hash": "sha256...",
  "name": "Customer Name",
  "mobile": "9999999999",
  "email": "optional@example.com",
  "created_ip": "203.0.113.10",
  "user_agent": "Mozilla/5.0 ...",
  "created_at": "2026-06-19T00:00:00.000Z",
  "expires_at": "2026-07-19T00:00:00.000Z",
  "revoked_at": null
}
```

Redis requirements:

- Managed Redis endpoint, username/password or IAM auth, TLS in production, and `REDIS_URL`.
- A Nest provider wrapping the Redis client, for example `ioredis`.
- Session service methods: create, read, revoke, refresh/delete expired, and validate token hash.
- OTP service methods: create challenge, resend, verify, lock challenge, expire challenge.
- Store only a hash of the cookie token, not the raw token.
- Store only a hash of the OTP, not the raw OTP.
- Use Redis TTL so expired sessions are automatically cleaned up.

Database alternative:

- A normal DB table can store sessions and inquiries if Redis is not available.
- DB persistence is better for audit/history; Redis is better for fast expiring sessions and rate limits.
- A common split is DB for inquiries/audit and Redis for active sessions/rate limits.

Cost note:

- Yes, Redis can increase cost if using a managed always-on instance.
- For low traffic, a serverless/usage-based Redis provider can be cheaper than a dedicated Memorystore instance.
- If the app already has a database and traffic is low, storing sessions in the DB can avoid adding Redis cost initially.
- Redis becomes more valuable when there are multiple backend instances, high request volume, or strict rate-limit consistency requirements.

Acceptance:

- Current phase: backend restart invalidating sessions is acceptable.
- Current phase: single backend instance with in-memory sessions is acceptable.
- Future phase: restarting the backend does not invalidate active sessions.
- Future phase: multiple backend instances share the same session state.

### Rate Limiting

Current:

- Rate limits are in memory.
- Exhausted limits currently return HTTP `429 Too Many Requests` with the configured message.
- Current responses do not include `Retry-After`; clients should show a generic cooldown message.
- This is acceptable for the current low-traffic single-instance phase.

Later implement when traffic/scaling requires it:

- Move rate limiting to Redis for multi-instance deployments.
- Keep or tune these limits:
  - Access request: 5 per IP per hour.
  - Signed URL generation: 60 per IP per hour.
  - Downloads: 20 per access session per day.
  - Invalid slug selections: 10 per IP per hour before throttling/blocking.
- Add `Retry-After` response headers so the UI can show a useful wait time.
- Return stable error payloads:

```json
{
  "statusCode": 429,
  "message": "Too many document access requests",
  "error": "Too Many Requests",
  "retry_after_seconds": 3600
}
```

Exhaustion behavior:

- Access request exhausted: user cannot record a new inquiry from that IP until the window resets.
- OTP request/resend exhausted: user cannot request or resend OTP for that mobile, email, or IP until the window resets.
- OTP verify exhausted: challenge is locked or verification is blocked until the window resets.
- Signed URL generation exhausted: user cannot generate new preview/download signed URLs until the window resets; already generated signed URLs still work until their own expiry.
- Download limit exhausted: block only `action: "download"` for that access session; preview can still be allowed if the signed URL generation limit is not exhausted.
- Invalid slug limit exhausted: throttle or block further invalid document selections from that IP to reduce probing.
- Expired signed URL is not a rate-limit failure; UI should request a fresh signed URL if the user still has catalog access and limits allow it.

Acceptance:

- Limits are consistent across instances.
- Repeated invalid slug probes are slowed or blocked.
- UI can distinguish `401` missing/expired access from `429` cooldown.

### Production GCS And CORS

Current:

- GCS CORS is not required if the frontend opens signed URLs directly in a tab, iframe, object/embed, or browser PDF viewer.

Implement only if frontend fetches signed PDFs as blobs:

```json
[
  {
    "origin": ["http://localhost:5173", "https://darshanent.co.in"],
    "method": ["GET", "HEAD"],
    "responseHeader": ["Content-Type", "Content-Disposition"],
    "maxAgeSeconds": 3600
  }
]
```

Acceptance:

- Direct PDF viewer usage works without GCS CORS.
- Blob-fetch PDF viewer usage works only after CORS is configured.

### Deployment

Cloud Run env:

```env
GCS_CATALOG_BUCKET=darshanent_catalog_dir
GCS_CATALOG_PUBLIC_ASSET_BUCKET=darshanent-thumbnail-dir
CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/darshanent-thumbnail-dir
CATALOG_SIGNED_URL_TTL_SECONDS=900
CATALOG_GOOGLE_CLIENT_ID=google-web-client-id.apps.googleusercontent.com
CATALOG_EMAIL_OTP_PROVIDER=zeptomail
CATALOG_EMAIL_FROM=no-reply@darshanent.co.in
CATALOG_ZEPTOMAIL_TOKEN=secret
CATALOG_WHATSAPP_OTP_PROVIDER=meta
CATALOG_WHATSAPP_TEMPLATE_NAME=catalog_access_otp
CATALOG_WHATSAPP_META_PHONE_NUMBER_ID=secret
CATALOG_WHATSAPP_META_ACCESS_TOKEN=secret
FRONTEND_ORIGIN=https://darshanent.co.in
HOST=0.0.0.0
PORT=8080
```

Implementation notes:

- Do not deploy local service account JSON keys.
- Attach the runtime service account to Cloud Run.
- Store provider tokens and Google client ids as deployment secrets/env vars, not frontend values.
- Keep `darshanent_catalog_dir` private.
- Keep `darshanent-thumbnail-dir` public-read and app-writable by the backend service account.
- Keep Object Versioning disabled on both buckets if old generations must not be retained.

### Frontend Integration

Implement:

- Use `/api/catalog/library` for selected company example sections.
- Use `/api/catalog/all` for complete navigation.
- Render thumbnails from returned `thumbnail_url` with lazy loading.
- Use slug route params for catalog pages.
- Before preview/download, try Google sign-in first when the access cookie is missing or invalid.
- If Google sign-in is unavailable or the user chooses another path, run WhatsApp OTP fallback.
- If WhatsApp OTP fails or the user prefers email, run email OTP fallback.
- Generate signed PDF URLs with slugs only.
- Refresh metadata after upload replacement because `document_id` changes.

Acceptance:

- UI does not construct GCS PDF paths.
- UI does not sign or proxy thumbnails.
- UI works when PDF filenames include spaces because filenames are not public identity.

## Local Testing Workflow

Start backend:

```bash
npm run start:dev
```

Fetch full catalog:

```bash
curl http://localhost:3000/api/catalog/all
```

Fetch selected company library:

```bash
curl -s \
  -H "Content-Type: application/json" \
  -d '{"company_slugs":["schneider"]}' \
  http://localhost:3000/api/catalog/library
```

Google sign-in cookie creation:

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "id_token": "GOOGLE_ID_TOKEN_FROM_FRONTEND"
  }' \
  http://localhost:3000/api/catalog/access/google
```

WhatsApp OTP request:

```bash
curl -s \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "mobile": "9999999999",
    "email": "test@example.com",
    "channel": "whatsapp"
  }' \
  http://localhost:3000/api/catalog/access/request-otp
```

Email OTP request:

```bash
curl -s \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "channel": "email"
  }' \
  http://localhost:3000/api/catalog/access/request-otp
```

OTP verify and cookie creation:

```bash
curl -i -c cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "challenge_id": "01J...",
    "mobile": "9999999999",
    "otp": "190399"
  }' \
  http://localhost:3000/api/catalog/access/verify-otp
```

For email OTP verification, replace `mobile` with `email`.

Create preview signed URL:

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "company_slug": "schneider",
    "category_slug": "industrial-automation",
    "document_slug": "plc-catalog",
    "action": "preview"
  }' \
  http://localhost:3000/api/catalog/documents/access
```

Create download signed URL:

```bash
curl -s -b cookies.txt \
  -H "Content-Type: application/json" \
  -d '{
    "company_slug": "schneider",
    "category_slug": "industrial-automation",
    "document_slug": "plc-catalog",
    "action": "download"
  }' \
  http://localhost:3000/api/catalog/documents/access
```

Use Postman collection:

```txt
postman/delta-backend-catalog-gcs.postman_collection.json
```

## Key Findings

- The backend must own GCP credentials; frontend and Postman must never receive service account credentials.
- Private bucket setup is correct for PDFs.
- Public thumbnail bucket setup is correct for small preview images.
- Uniform bucket-level access is preferred.
- Fine-grained ACLs are not needed.
- GCS does not generate PDF thumbnails; upload/update must create them.
- Google sign-in is the primary access path and is verified on the backend with Google ID tokens.
- Email OTP fallback is implemented for SES or ZeptoMail provider configuration.
- WhatsApp OTP fallback is implemented for Meta Cloud API or generic HTTP BSP provider configuration.
- CORS and origin guards are useful browser controls, but they are not authentication.
- The main remaining production security gap is persistent session/challenge storage.

## References

- GCS signed URLs: https://docs.cloud.google.com/storage/docs/access-control/signed-urls
- GCS list objects: https://docs.cloud.google.com/storage/docs/listing-objects
- GCS object metadata: https://docs.cloud.google.com/storage/docs/metadata
- GCS IAM roles: https://docs.cloud.google.com/storage/docs/access-control/iam-roles
- Application Default Credentials: https://docs.cloud.google.com/docs/authentication/application-default-credentials
- Google Identity Services: https://developers.google.com/identity
- Google ID token verification: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- AWS SES SendEmail: https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_SendEmail.html
- ZeptoMail email API: https://www.zoho.com/zeptomail/help/api/email-sending.html
- WhatsApp authentication templates: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates/

## Verification

- `/api/catalog/library` returns all thumbnail URLs needed for requested companies.
- `/api/catalog/all` returns all thumbnail URLs needed for full navigation.
- Public thumbnail URLs load directly from `darshanent-thumbnail-dir`.
- `/api/catalog/documents/access` accepts slug selection and returns a signed PDF URL plus resolved `document_id`.
- PDF access fails without a valid `catalog_access` cookie.
- `POST /api/catalog/access` records inquiries only and does not set `catalog_access`.
- `POST /api/catalog/access/google` sets `catalog_access` after verified Google ID token login.
- WhatsApp OTP request supports `channel: "whatsapp"` and does not set `catalog_access`.
- Email OTP request supports `channel: "email"` and does not set `catalog_access`.
- Wrong OTP verification does not set `catalog_access`.
- Successful OTP verification sets `catalog_access`.
- Obsolete endpoint shapes and document-id signing payloads are not documented or supported.
