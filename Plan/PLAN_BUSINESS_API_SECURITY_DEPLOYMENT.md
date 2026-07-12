# Business API Security Deployment

## Implemented trust boundaries

| Surface | Production origin | Access |
|---|---|---|
| Public UI | `https://darshanent.co.in` | Public catalog and CAPTCHA-protected message submission |
| Business UI | `https://business.darshanent.co.in` | Google allowlist, business session, exact Origin and CSRF |
| Public API | `https://darshanent.co.in/api` | Only public and business routes |
| Admin API | Cloud Run URL for `delta-backend-admin` | Cloud Run IAM identity token and admin token |

The public service returns `404` for `/api/internal/**`. The admin service runs
with `INTERNAL_ADMIN_SERVICE_ONLY=true`, so it returns `404` for every route
except `/api/internal/**` and `/api/health`.

## Route matrix

```text
POST   /api/message

POST   /api/business/auth/google
GET    /api/business/auth/me
POST   /api/business/auth/logout
GET    /api/business/messages
GET    /api/business/catalog/all
POST   /api/business/catalog/documents
POST   /api/business/catalog/documents/access
PUT    /api/business/catalog/documents/:document_id
PUT    /api/business/catalog/companies/:company_slug
DELETE /api/business/catalog/documents/:document_id

GET    /api/internal/messages
POST   /api/internal/catalog/documents
PUT    /api/internal/catalog/documents/:document_id
PUT    /api/internal/catalog/companies/:company_slug
DELETE /api/internal/catalog/documents/:document_id
```

Business mutations and logout require `X-CSRF-Token`. The token is returned by
Google login and `/auth/me`, and the UI retains it only in module memory.

The production cookie is:

```text
__Host-business_session=<32-byte opaque token>
Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000
```

Only its SHA-256 hash is stored in `business_sessions`. Sessions have a 30-day
absolute lifetime, seven-day idle timeout, 24-hour rotation, and a maximum of
five active sessions per Google subject.

## Required public-service configuration

```env
NODE_ENV=production
PUBLIC_FRONTEND_ORIGIN=https://darshanent.co.in
BUSINESS_FRONTEND_ORIGIN=https://business.darshanent.co.in
BUSINESS_UI_GOOGLE_CLIENT_ID=<web OAuth client ID>
BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=<comma-separated dashboard administrators>
BUSINESS_UI_ALLOWED_GOOGLE_SUBS=<optional subjects for non-Gmail/non-Workspace accounts>
BUSINESS_UI_REQUIRED_GOOGLE_DOMAIN=darshanent.co.in
BUSINESS_UI_CSRF_SECRET=<Secret Manager reference, minimum 32 characters>
FIRESTORE_DATABASE_ID=client-message-db
RECAPTCHA_ENTERPRISE_PROJECT_ID=deweb-preview1
RECAPTCHA_ENTERPRISE_SITE_KEY=<website key>
INTERNAL_ADMIN_API_ENABLED=false
INTERNAL_ADMIN_SERVICE_ONLY=false
```

Do not configure `BACKEND_ADMIN_TOKEN` on the public service.

The authorization provider accepts exact Gmail addresses. A
`@darshanent.co.in` first login must also contain Google's verified
`hd=darshanent.co.in` claim. Other domains require an explicit immutable Google
subject in `BUSINESS_UI_ALLOWED_GOOGLE_SUBS`. Firestore binds the accepted email
to `business_users/{sub}` on first login. Every request rechecks the current
environment allowlist, the active Firestore user, and the original subject
binding.

## Public message controls

`POST /api/message` requires:

- exact public-site `Origin`;
- `captcha_token` from reCAPTCHA Enterprise action `contact_message`;
- at most five submissions per IP per hour;
- at most one submission per normalized email/mobile pair every ten minutes;
- DTO whitelisting, unexpected-field rejection, and maximum lengths.

Rate counters are stored transactionally in Firestore collection
`message_rate_limits`; raw IP, email, and mobile values are not used as
document IDs.

## Deployment

The scripts prepare the two distinct Cloud Run services:

```bash
RECAPTCHA_ENTERPRISE_SITE_KEY=<site-key> \
BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=<admins> \
npm run deploy:gcp

BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=<admins> \
npm run deploy:gcp:admin
```

`deploy:gcp` restricts ingress to internal/load-balancer traffic, disables the
default URL, removes the admin token, and uses the CSRF secret from Secret
Manager. `deploy:gcp:admin` requires IAM invocation and exposes only internal
routes at application level.

An operator invokes the admin service with both factors:

```bash
curl \
  -H "Authorization: Bearer $(gcloud auth print-identity-token --audiences=<admin-service-url>)" \
  -H "x-backend-admin-token: <rotated-token>" \
  <admin-service-url>/api/internal/messages
```

Do not store either token in Postman collection files or frontend environment
variables.

## External changes required before production

1. Put `darshanent.co.in` behind a global external Application Load Balancer
   with a Google-managed certificate.
2. Route `/api` and `/api/*` to the `asia-south1` `delta-backend` serverless
   NEG. Route all other paths to the public UI service/backend.
3. Attach Cloud Armor policies for Google-login abuse and public message abuse.
4. Add `https://business.darshanent.co.in` to the OAuth web client's Authorized
   JavaScript Origins.
5. Create Secret Manager secret `BUSINESS_UI_CSRF_SECRET` with at least 32
   random characters and grant the runtime service account secret access.
6. Create the reCAPTCHA Enterprise website key restricted to
   `darshanent.co.in`; supply its site key to both public UI and backend.
7. Enable Firestore TTL for `business_sessions.expires_at` and
   `message_rate_limits.expires_at`.
8. Deploy `delta-backend-admin`, then grant `roles/run.invoker` only to approved
   operator identities.
9. Rotate `BACKEND_ADMIN_TOKEN`, expose it only to `delta-backend-admin`, and
   update private operator tooling.
10. Configure both frontend builds with
    `VITE_API_BASE_URL=https://darshanent.co.in/api`; configure the public
    build with `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.
11. Delete old frontend admin-token environment variables and redeploy both
    frontends so old bundles are replaced.
12. Require two-step verification for all dashboard administrators.
13. After verification, remove old public admin routing at the load balancer
    and revoke any obsolete service URLs/tokens.
14. Longer term, create `delta-business-admins@darshanent.co.in` and replace the
    environment provider with Google Workspace group membership.

Cloud Run remains capped at one public instance because the older customer
catalog-access sessions are still process-local. Business sessions themselves
are multi-instance safe. Persist the customer catalog-access and OTP state
before increasing that limit.

Do not implement `/api` as a Firebase Hosting rewrite while the application
uses both business and catalog session cookies. Firebase Hosting strips
incoming cookies other than the specially named `__session` cookie. Use the
load balancer's URL map so both HttpOnly cookies reach Cloud Run unchanged.
