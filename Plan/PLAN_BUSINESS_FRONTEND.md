# business-delta-ui Frontend Plan

## Summary

`business-delta-ui` is the internal business catalog management UI. It lets approved business users sign in with Google, then create, update, replace, and delete catalog PDFs and related catalog metadata.

- Access is for business users only.
- Login uses Google accounts.
- Authorization uses a GCP/Cloud Identity Google Group checked from the signed-in Google email.
- Login is remembered by a backend HttpOnly business session cookie for 6 months on the same browser/device, subject to backend session persistence.
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
- Backend checks the signed-in Google email against an approved GCP/Cloud Identity Google Group.
- Backend creates a 6-month business session cookie.
- Frontend calls business/admin catalog APIs with `credentials: "include"`.
- Frontend restores login state by calling `/api/business/auth/me` on app load because the business session cookie is HttpOnly.
- Header shows whether the business user is signed in, signed out, unauthorized, or expired.
- Backend never exposes `CATALOG_ADMIN_TOKEN` to the browser.
- Business auth is separate from public catalog `catalog_access`; public customer login must not authorize business APIs.

## Business Login UX Requirements

- Use Google Identity Services to obtain a browser ID token.
- Send only the Google ID token to `POST /api/business/auth/google` with `credentials: "include"`.
- Do not store Google ID tokens, raw access tokens, group membership flags, or trusted login state in localStorage/sessionStorage.
- After successful backend auth, use the response user summary to update the Header immediately.
- On app load, route refresh, and browser revisit, call `GET /api/business/auth/me` with `credentials: "include"` to restore state from the 6-month cookie.
- Header states:
  - `unknown`: session restore is in progress.
  - `signed_out`: no valid backend business session; show Google sign-in.
  - `signed_in`: valid backend session and group membership; show name/email and account menu.
  - `unauthorized`: Google account is valid but not in the allowed business group; show no-access state and logout/switch-account action.
  - `expired`: previous session is invalid/expired; show sign-in again.
- If any business catalog API returns `401`, mark session expired/signed out and send the user back to Google sign-in.
- If any business catalog API returns `403`, mark session unauthorized and block catalog management actions.
- Logout calls `POST /api/business/auth/logout`, clears local non-sensitive UI state, and returns Header to signed out.

## GCP Group Plan

- Create a Google Group/Cloud Identity group for business UI access, for example `delta-business-catalog-admins@<domain>`.
- Add approved business user emails to that group.
- Treat this group as the source of truth for who can access `business-delta-ui`.
- The group can be reused in GCP IAM if desired, but browser access must be authorized by backend membership checks, not by frontend claims or direct GCS bucket permissions.
- GCS bucket permissions are not the login mechanism for the website; the backend should continue to perform catalog storage operations with its service account.
- If the same group is granted GCS IAM roles for operational visibility, keep those permissions separate from website authorization and grant the minimum required bucket/object roles only.
- Configure backend with the allowed group email:

```env
BUSINESS_UI_GOOGLE_CLIENT_ID=<google-oauth-client-id>
BUSINESS_UI_ALLOWED_GROUP_EMAIL=delta-business-catalog-admins@<domain>
BUSINESS_UI_SESSION_SECRET=<long-random-secret>
BUSINESS_UI_SESSION_TTL_SECONDS=15552000
BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN=<optional-company-domain>
```

- Backend should check group membership server-side using the selected GCP identity API for the organization.
- Cache group membership briefly, for example 5-15 minutes, to avoid checking GCP on every request.
- Deny access if the user email is not verified, missing, outside the optional required domain policy, or not in the allowed group.
- Re-check membership on session restore and protected API access, using cache where appropriate, so removed users lose access without waiting for the 6-month cookie expiry.
- Log access denials with email, reason, request path, and timestamp, without logging tokens.
- Audit successful sign-ins, logout, group membership denial, and catalog mutations with user email and timestamp.

## Required Backend Auth To-Do

- Add a business auth module separate from customer OTP catalog access.
- Add `POST /api/business/auth/google` to exchange a Google ID token for a backend business session cookie.
- Add `POST /api/business/auth/logout` to clear the business session cookie.
- Add `GET /api/business/auth/me` to return the current business user and authorization state.
- Add a business session cookie with `HttpOnly`, `SameSite=Lax`, `Path=/api/business`, `Expires`/`Max-Age` for 6 months, and `Secure` in production.
- Add a business auth guard that validates the session cookie and group authorization.
- Add backend group membership service that checks the configured Google Group/Cloud Identity group by email.
- Add server-side session storage that can survive backend restarts before relying on 6-month login in production.
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

Auth response shape:

```json
{
  "ok": true,
  "auth_provider": "google",
  "email": "manager@example.com",
  "name": "Business Manager",
  "group": "delta-business-catalog-admins@example.com",
  "authorized": true,
  "expires_at": "2026-12-20T00:00:00.000Z"
}
```

Unauthorized Google account response:

```json
{
  "ok": false,
  "authorized": false,
  "email": "external@example.com",
  "reason": "not_in_allowed_group"
}
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
- In the Header, show signed-in status with Google name/email when authorized; otherwise show sign-in, session expired, or no-access state.
- Keep auth state in app-level state: `unknown`, `signed_out`, `signed_in`, `unauthorized`, and `expired`.
- Use `credentials: "include"` for auth, logout, catalog listing, create, update, and delete calls.
- Rely on backend session cookie for 6-month same-device/browser login; never rely on localStorage as proof of access.
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
- `401` from `/api/business/auth/me`: no valid backend session; Header should show signed out.
- `403` from `/api/business/auth/me`: valid Google identity but not an allowed group member; Header should show unauthorized/no-access.
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
- Business session cookie must be HttpOnly and valid for 6 months on the same browser/device when backend session storage remains valid.
- Logout clears the backend business session and local non-sensitive UI state.
- All catalog mutations require backend session authorization and group membership.
- All group membership decisions happen server-side against the configured GCP/Cloud Identity group.
- Frontend must not trust a client-side email domain, cached membership flag, ID-token payload, or localStorage value as authorization.
- Business app origin must be explicitly allowed by backend CORS/origin configuration.

## Open Backend Decisions

- Choose the final backend group membership API for the organization setup.
- Decide whether to keep token admin routes for Postman/local scripts after `/api/business/catalog` exists.
- Decide if business sessions are in memory for the first phase or persisted in Redis/datastore; production 6-month login requires persistence across backend restarts.
- Decide the exact Google Group address and whether a required Google Workspace domain should also be enforced.
- Decide membership cache TTL and revocation behavior for removed group users.
- Company-level thumbnails are not supported; business users manage document PDFs and document thumbnails only.
- Decide whether audit logs should be stored in application logs only or persisted as catalog admin history.

## Acceptance Checklist

- User can sign in with a Google account.
- Backend verifies the Google ID token and checks membership in the configured GCP email group.
- Non-group users cannot access catalog management screens or mutation APIs.
- Header shows signed-in/signed-out/unauthorized state and restores state from `/api/business/auth/me`.
- Same browser/device remains signed in for 6 months while the backend session and group membership remain valid.
- Group users can create a catalog document with PDF upload.
- Group users can update display/category metadata by `document_id`.
- Group users can replace a PDF and see the returned new `document_id`.
- Group users can delete a document by `document_id`.
- Frontend never exposes `CATALOG_ADMIN_TOKEN` or service credentials.
- Catalog list refreshes after every mutation.
- Public `delta-ui` catalog view reflects business changes after metadata refresh.
