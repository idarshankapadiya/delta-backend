# business-delta-ui Frontend Plan

## Summary

`business-delta-ui` is the internal business catalog management UI. It lets approved business users sign in with Google, then create, update, replace, and delete catalog PDFs and related catalog metadata.

- Access is for business users only.
- Login uses Google accounts.
- Authorization uses a GCP-managed email group.
- Catalog management uses backend admin APIs.
- Public customer browsing, OTP access, PDF preview, and PDF download live in `delta-ui`, not here.
- Current backend implementation is still token-guarded admin API access; the Google/group business auth model below is the production target, not implemented behavior.

## Implemented Backend Pointers

- Current admin mutation endpoints: `src/catalog/catalog.controller.ts`.
- Current admin guard: `src/catalog/catalog-admin.guard.ts`.
- Current admin secret: `CATALOG_ADMIN_TOKEN`.
- Upload/update/delete behavior plan: `Plan/PLAN_File_Upload.md`.

Current backend admin auth is token based with `x-catalog-admin-token`. Google login and GCP group authorization are not implemented yet and need a backend auth layer before this UI should be used in production.

## Current Backend Implementation

Available now:

```http
GET /api/catalog/all
POST /api/catalog/documents
PUT /api/catalog/documents/:document_id
DELETE /api/catalog/documents/:document_id
```

Admin mutation requests require:

```http
x-catalog-admin-token: <CATALOG_ADMIN_TOKEN>
```

Current behavior:

- Create uploads one private PDF to `{company_slug}/{uploaded_pdf_file_name}`, creates a new ULID `document_id`, stores snake_case metadata, and writes a public document thumbnail.
- Metadata-only update keeps the same `document_id`.
- PDF replacement writes the new uploaded PDF filename, generates a new `document_id`, deletes the previous private PDF object, and writes the matching public thumbnail URL.
- Delete removes the private uploaded PDF object and matching public document thumbnail.
- Catalog listing and public customer routes use slugs; admin update/delete uses `document_id`.
- `x-catalog-admin-token` must stay server-side. A browser production UI needs the future business session wrapper before direct use.

## Target Access Model

- User opens `business-delta-ui`.
- User signs in with Google.
- Frontend receives a Google ID token through Google Identity Services or equivalent OAuth client.
- Frontend sends the ID token to the backend.
- Backend verifies the ID token issuer, audience, expiry, and email verification state.
- Backend checks the signed-in email against an approved GCP email group.
- Backend creates a short-lived business session cookie.
- Frontend calls business/admin catalog APIs with `credentials: "include"`.
- Backend never exposes `CATALOG_ADMIN_TOKEN` to the browser.

## GCP Group Plan

- Create a Google group for business UI access, for example `delta-business-catalog-admins@<domain>`.
- Add approved business user emails to that group.
- Configure backend with the allowed group email:

```env
BUSINESS_UI_GOOGLE_CLIENT_ID=<google-oauth-client-id>
BUSINESS_UI_ALLOWED_GROUP_EMAIL=delta-business-catalog-admins@<domain>
BUSINESS_UI_SESSION_SECRET=<long-random-secret>
```

- Backend should check group membership server-side using the selected GCP identity API for the organization.
- Cache group membership briefly, for example 5-15 minutes, to avoid checking GCP on every request.
- Deny access if the user email is not verified, missing, outside the required domain policy, or not in the allowed group.
- Log access denials with email, reason, request path, and timestamp, without logging tokens.

## Required Backend Auth To-Do

- Add a business auth module separate from customer OTP catalog access.
- Add `POST /api/business/auth/google` to exchange a Google ID token for a backend business session cookie.
- Add `POST /api/business/auth/logout` to clear the business session cookie.
- Add `GET /api/business/auth/me` to return the current business user and authorization state.
- Add a business session cookie with `HttpOnly`, `SameSite=Lax`, `Path=/api/business`, and `Secure` in production.
- Add a business auth guard that validates the session cookie and group authorization.
- Move or wrap catalog admin mutations behind `/api/business/catalog/...` routes.
- Keep existing `x-catalog-admin-token` endpoints only for local scripts/Postman if still needed.
- Never accept group membership claims from the frontend; verify membership on the backend.

## Business API Shape

Preferred production-facing business routes:

```http
POST /api/business/catalog/documents
PUT /api/business/catalog/documents/:document_id
DELETE /api/business/catalog/documents/:document_id
GET /api/business/catalog/all
GET /api/business/auth/me
POST /api/business/auth/google
POST /api/business/auth/logout
```

Current backend routes available before the business auth wrapper:

```http
POST /api/catalog/documents
PUT /api/catalog/documents/:document_id
DELETE /api/catalog/documents/:document_id
```

Current routes require:

```http
x-catalog-admin-token: <CATALOG_ADMIN_TOKEN>
```

The browser UI must not receive or store `CATALOG_ADMIN_TOKEN`; use token-based admin routes only through Postman, local scripts, or a temporary local-only backend proxy during development.

## Catalog Management UI To-Do

- Add Google sign-in screen and signed-in account menu.
- Call `/api/business/auth/me` on app load to restore the business session.
- Show unauthorized state when the Google account is valid but not in the allowed GCP group.
- Build catalog list from `/api/business/catalog/all` or, temporarily, `/api/catalog/all`.
- Show company, category, document slug, display name, `document_id`, file size, updated date, and thumbnail.
- Add create document form with:
  - `company_slug`
  - optional `category_slug`
  - `document_slug`
  - `display_name`
  - PDF file upload
- Add update document form by `document_id` with:
  - optional `display_name`
  - optional `category_slug`
  - optional replacement PDF file
- Add delete confirmation by `document_id`.
- Show replacement warning: PDF replacement generates a new `document_id` while preserving public slugs.
- Refresh catalog metadata after create/update/delete.
- Surface thumbnail regeneration status by reloading the stable public thumbnail URL after mutations.
- Use the returned `thumbnail_url` directly; append a UI-only cache buster after successful replacement if cached bytes remain visible.
- Disable duplicate submits during uploads.
- Show upload progress if the frontend stack supports it.

## Catalog Management Rules

- Use `document_id` only for business/admin mutation actions.
- Use slugs as public catalog identity.
- Do not let users edit `company_slug` or `document_slug` in an update flow unless backend explicitly supports slug migration later.
- Do not construct private GCS paths in the browser.
- Do not expose service account credentials, GCS credentials, or `CATALOG_ADMIN_TOKEN` to the browser.
- Accept only PDF files in the upload control.
- Respect backend upload size limit from `CATALOG_UPLOAD_MAX_BYTES`; show a friendly error before upload when known.
- Treat public thumbnail paths as stable and cacheable; append a UI-only cache buster after successful replace if the old thumbnail is still visible.

## Error Handling

- `401`: Google session missing/expired; send user back to sign in.
- `403`: signed-in Google account is not in the allowed business group; show no-access state.
- `400`: invalid form field, non-PDF upload, missing file, or bad multipart request; show field-level feedback when possible.
- `404`: `document_id` does not exist; refresh catalog list.
- `409`: duplicate `{company_slug}/{document_slug}` on create; ask user to choose different slugs or update the existing document.
- `413`: PDF exceeds upload limit; show max allowed size.
- `429`: rate limit or temporary protection; show cooldown message and avoid retry loops.
- `5xx`: backend/GCS/thumbnail generation problem; show temporary failure and allow retry.

## Security Requirements

- Frontend stores no access token, admin token, service account JSON, signed URL, or GCS credential in localStorage.
- Frontend may store non-sensitive UI filters and draft form values only.
- Backend session cookie is the source of business auth state.
- Logout clears the backend business session and local non-sensitive UI state.
- All catalog mutations require backend session authorization and group membership.
- Business app origin must be explicitly allowed by backend CORS/origin configuration.

## Open Backend Decisions

- Choose the final backend group membership API for the organization setup.
- Decide whether to keep token admin routes for Postman/local scripts after `/api/business/catalog` exists.
- Decide if business sessions are in memory for the first phase or persisted in Redis/datastore.
- Company-level thumbnails are not supported; business users manage document PDFs and document thumbnails only.
- Decide whether audit logs should be stored in application logs only or persisted as catalog admin history.

## Acceptance Checklist

- User can sign in with a Google account.
- Backend verifies the Google ID token and checks membership in the configured GCP email group.
- Non-group users cannot access catalog management screens or mutation APIs.
- Group users can create a catalog document with PDF upload.
- Group users can update display/category metadata by `document_id`.
- Group users can replace a PDF and see the returned new `document_id`.
- Group users can delete a document by `document_id`.
- Frontend never exposes `CATALOG_ADMIN_TOKEN` or service credentials.
- Catalog list refreshes after every mutation.
- Public `delta-ui` catalog view reflects business changes after metadata refresh.
