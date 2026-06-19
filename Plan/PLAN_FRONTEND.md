# delta-ui Frontend Plan

## Summary

`delta-ui` is the public, user-facing catalog UI. It lets customers browse catalog metadata, view public thumbnails, sign in with Google, preview private PDFs, and download private PDFs through backend-issued signed URLs.

- Public metadata comes from `/api/catalog/library` and `/api/catalog/all`.
- Public thumbnails are normal image URLs from `darshanent-thumbnail-dir`.
- Private PDFs require a backend `catalog_access` session from Google sign-in, then `/api/catalog/documents/access`.
- Access is remembered by the backend `catalog_access` HttpOnly cookie for 6 months on the same browser/device, subject to backend session persistence.
- Catalog routes and PDF access use slugs, not `document_id`.
- `document_id` is response/admin metadata and can change when a PDF is replaced.
- Create, update, delete, and business catalog management do not belong in this app; those go in `business-delta-ui`.

## Implemented Backend Pointers

- Public catalog routes: `src/catalog/catalog.controller.ts`.
- Google sign-in, deferred OTP, and session logic: `src/catalog/catalog-access.service.ts`.
- View/download signing logic: `src/catalog/catalog.service.ts`.
- Origin validation: `src/catalog/catalog-origin.guard.ts`.
- Rate limiting: `src/catalog/catalog-rate-limiter.service.ts`.
- Existing `delta-ui` inquiry dialog reference: `/Users/darshankapadiya/Developer/Ankita/delta-ui/src/components/Catalog/components/InquiryFormDialog.tsx`.
- Detailed backend plan: `Plan/PLAN_FILE_VIEW_DOWNLOAD.md`.

## API Usage

Initial/library view:

```http
POST /api/catalog/library
```

```json
{
  "company_slugs": ["schneider", "polycab"]
}
```

Full navigation:

```http
GET /api/catalog/all
```

Expected document fields:

```json
{
  "document_id": "01J...",
  "company_slug": "schneider",
  "category_slug": "industrial-automation",
  "document_slug": "plc-catalog",
  "display_name": "PLC Catalog",
  "thumbnail_url": "https://storage.googleapis.com/darshanent-thumbnail-dir/catalog-thumbnails/v1/schneider/plc-catalog.webp",
  "metadata": {
    "sizeLabel": "120.6 KB",
    "updatedLabel": "19 Jun 2026"
  }
}
```

Google sign-in:

```http
POST /api/catalog/access/google
```

Frontend source:

- Use Google Identity Services to get an ID token from the browser.
- Send only the ID token to the backend.
- Backend verifies token audience and `email_verified`, then sets `catalog_access`.

```json
{
  "id_token": "google-id-token-from-frontend"
}
```

Expected response:

```json
{
  "ok": true,
  "auth_provider": "google",
  "email": "customer@gmail.com",
  "name": "Customer Name",
  "expires_at": "2026-12-19T00:00:00.000Z"
}
```

Session status for header display:

```http
GET /api/catalog/access/me
```

Needed backend addition:

- Read the `catalog_access` HttpOnly cookie server-side.
- Return `200` with the current user summary when the cookie maps to a valid session.
- Return `401` when the cookie is missing, expired, invalid, or the in-memory session was lost.
- Use `credentials: "include"` from the frontend.

Expected signed-in response:

```json
{
  "ok": true,
  "auth_provider": "google",
  "email": "customer@gmail.com",
  "name": "Customer Name",
  "expires_at": "2026-12-19T00:00:00.000Z"
}
```

Inquiry-only contact capture:

```http
POST /api/catalog/access
```

Current behavior:

- Records inquiry details and returns `{ "ok": true, "inquiry_only": true }`.
- Does not set `catalog_access`.
- Must not be used as an access grant path.

```json
{
  "name": "Customer Name",
  "mobile": "9999999999",
  "email": "optional@example.com",
  "message": "optional message"
}
```

Deferred OTP fallback:

- Backend routes exist for `/api/catalog/access/request-otp` and `/api/catalog/access/verify-otp`.
- Backend OTP delivery/validation is not production-ready for the public catalog unlock flow.
- Do not call OTP endpoints from the current `delta-ui` preview/download unlock flow.
- Reintroduce WhatsApp/email OTP only after backend OTP delivery, validation, rate-limit UX, and security review are explicitly approved.

Signed PDF URL:

```http
POST /api/catalog/documents/access
```

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
  "expires_at": "2026-06-19T10:45:00.000Z",
  "ttl_seconds": 900,
  "file_name": "PMS_Metering.pdf"
}
```

## UI Routes

- `/catalog`
- `/catalog/:company_slug/:document_slug`
- `/catalog/:company_slug/:category_slug/:document_slug`

## UI Implementation To-Do

- Build catalog landing/navigation from `/api/catalog/all`.
- Build selected-company sections from `/api/catalog/library` where needed.
- Render `thumbnail_url` directly in `<img loading="lazy">`.
- Add a document detail page that resolves route slugs against catalog metadata.
- Gate every `/catalog` preview/view and download action behind a login check before opening the PDF or download URL.
- Add preview and download actions that first try `/api/catalog/documents/access` with `credentials: "include"`.
- If the user is not signed in or signed URL access returns `401`, open the catalog login dialog and keep the intended action as pending state.
- Use the current `InquiryFormDialog` flow as UI reference only; replace OTP unlock with Google sign-in for this release.
- Put Google sign-in as the only unlock method for preview/download in the current release.
- After Google sign-in success, retry the pending preview/download action automatically.
- Do not show WhatsApp or email OTP unlock choices until backend OTP validation is production-ready.
- Use `credentials: "include"` for session status, Google access, and signed URL requests.
- Add catalog auth state to app/header state: `unknown`, `signed_out`, `signed_in`, and `expired`.
- On app load and route refresh, call the session status endpoint once to restore header state from the backend cookie.
- In the Header, show a signed-in indication with the Google name/email when available; otherwise show a clear login/sign-in action.
- After Google sign-in success, update Header state immediately from the backend response and rely on the six-month cookie for future visits on the same browser/device.
- If session status or document access returns `401`, update Header state to signed out/expired and show login before retrying preview/download.
- Request `action: "preview"` for the PDF viewer.
- Request `action: "download"` for downloads and open/navigate to the returned URL.
- Refresh signed URLs when they expire; never keep them as durable state.
- Refresh catalog metadata after `404` because the document may have been replaced or deleted.

## UI Rules

- Use returned `thumbnail_url` directly.
- Do not proxy, sign, base64 embed, or fetch thumbnails through the backend.
- Do not construct private GCS PDF paths.
- Do not use PDF filenames as identity.
- Do not send `document_id` to `/api/catalog/documents/access`.
- Do not send a client-side verified flag; backend decides access from Google token verification and the session cookie.
- Do not store Google ID tokens. Treat them as single-use handoff values to `/api/catalog/access/google`.
- localStorage may be used only for non-sensitive convenience: remembered form fields, selected company slug, or last opened route.
- localStorage must not store OTPs, Google ID tokens, raw access tokens, signed PDF URLs, service credentials, private object paths, admin tokens, or a trusted logged-in flag.
- Never put OTP values, Google ID tokens, or signed URLs in page URLs.

## Access UX Requirements

- Step 1: when the user clicks View/Preview or Download on `/catalog`, check restored auth state; if state is not signed in, open the access modal before calling document access.
- Step 2: use Google Identity Services to obtain an ID token and call `/api/catalog/access/google` with `credentials: "include"`.
- Step 3: after Google success, immediately retry the intended preview/download action.
- Step 4: if Google is unavailable, canceled, or rejected, keep the user in a signed-out state and show a retry/contact-sales style message; do not show OTP unlock options yet.
- If the user looked signed in but `/api/catalog/documents/access` returns `401`, treat the session as expired, update Header state, and reopen Google login with the same pending action.
- The login modal may collect inquiry details before or near Google sign-in if product wants lead capture, but only `/api/catalog/access/google` grants access.
- Do not call `/api/catalog/access` as part of the unlock flow except to record a standalone inquiry; it is inquiry-only and does not create access.
- Never show, request, store, or log OTP values in the current public catalog unlock UI.

## Backend Limitations To Reflect In UI

- `catalog_access` sessions are currently in memory until backend persistence is implemented.
- `POST /api/catalog/access` is inquiry-only and intentionally does not set `catalog_access`.
- Google sign-in requires the frontend Google client ID to match backend `CATALOG_GOOGLE_CLIENT_ID`.
- Google ID token verification happens only on the backend; frontend success alone does not grant catalog access.
- Backend default access TTL is 180 days (`CATALOG_ACCESS_TTL_SECONDS`), matching the 6-month same-browser login requirement.
- The `catalog_access` cookie is HttpOnly and scoped to `Path=/api/catalog`; the Header needs a backend session-status endpoint to display reliable login state after refresh.
- OTP delivery/validation is not part of the current public catalog unlock UX.
- Backend restart can invalidate access cookies before browser expiry.
- Rate limits are currently in memory and return `429` when exhausted.
- Current `429` responses may not include `Retry-After`; show a generic cooldown message.
- Signed URL generation has an hourly limit per IP.
- Download has a daily limit per access session.
- Already generated signed URLs continue working until their own expiry even if a later request hits a rate limit.
- Public thumbnail URL paths stay stable, but browser/CDN cache can briefly show previous images after replacement.

## Error Handling

- `401` from `/api/catalog/documents/access`: access cookie is missing, expired, or invalid; show access flow.
- `401` from `/api/catalog/access/google`: Google token is invalid, unverified, expired, wrong audience, or backend Google client id is misconfigured; keep user signed out and allow Google retry.
- `401` from `/api/catalog/access/me`: no valid backend session; Header should show signed out and view/download should require Google login.
- `404`: selected slugs do not resolve to a current document; refresh catalog metadata and show not-found state.
- `429`: rate limit exhausted; show cooldown message and avoid retry loops.
- `5xx`: backend/GCS/signing problem; show temporary failure state and allow retry.
- Failed public thumbnail load: show a neutral document placeholder, not a broken image icon.

## Assumptions

- `delta-ui` origin is included in backend `FRONTEND_ORIGIN`.
- `delta-ui` has a public Google web client ID, for example `VITE_GOOGLE_CLIENT_ID`.
- Backend `CATALOG_GOOGLE_CLIENT_ID` includes the same Google web client ID.
- Browser can read public thumbnails from `darshanent-thumbnail-dir`.
- Browser/PDF viewer opens signed GCS URLs directly.
- GCS CORS is only needed if the frontend fetches signed PDF URLs as blobs.
- No backward compatibility with old catalog endpoints or document-id signing payloads is required.

## Acceptance Checklist

- Library page renders company examples using `/api/catalog/library`.
- Navigation renders all companies/categories/documents using `/api/catalog/all`.
- Thumbnails load directly from the public thumbnail bucket.
- Preview/download uses slug-based signed URL generation.
- View/preview and download actions on `/catalog` require login before opening a signed PDF URL.
- Google sign-in is the only current unlock path for private PDF access.
- Header shows signed-in/signed-out catalog access state and restores it from the backend cookie on refresh.
- Same browser/device remains signed in for 6 months while the backend session remains valid.
- Backend access session creation completes before private PDF access.
- UI never sends `document_id` to `/api/catalog/documents/access`.
- UI handles Google sign-in failure, session expiry, `401`, `404`, `429`, and expired signed URLs gracefully.
