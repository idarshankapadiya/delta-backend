# Delta Backend

NestJS API for the public Darshan Enterprises website and the Business Delta
administration dashboard.

## Production surfaces

| Surface             | Intended URL                        | Purpose                                                            |
| ------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| Public/business API | `https://darshanent.co.in/api`      | Public catalog/message APIs and Google-authenticated business APIs |
| Internal admin API  | `delta-backend-admin` Cloud Run URL | IAM-protected Postman/operator catalog operations                  |

The two Cloud Run services use the same source code but have separate security
boundaries:

- `delta-backend` exposes public and business routes. It must not contain
  `BACKEND_ADMIN_TOKEN`.
- `delta-backend-admin` exposes only `/api/internal/**` and `/api/health`. It
  requires Cloud Run IAM plus `x-backend-admin-token`.

The deployment scripts require separate runtime identities. The internal
service uses `backend-admin-api-sa@deweb-preview1.iam.gserviceaccount.com`;
its preflight requires that identity to have `BACKEND_ADMIN_TOKEN` access and
rejects deployment while the public runtime identity can read that secret.

## Local setup

Requirements:

- Node.js 24
- npm
- Google Cloud CLI for deployment

```bash
npm install
npm run build
```

Local development:

```bash
npm run start-backend:dev
```

Tests:

```bash
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

## Deployment commands

The package provides:

```json
"deploy:gcp": "bash scripts/deploy-gcp.sh",
"deploy:gcp:admin": "bash scripts/deploy-gcp-admin.sh"
```

Run them through npm from the backend repository root:

```bash
cd /Users/darshankapadiya/Developer/delta/delta-backend

npm run deploy:gcp
npm run deploy:gcp:admin
```

### `npm run deploy:gcp`

Updates the existing `delta-backend` Cloud Run service from the current local
working tree.

It:

- deploys to project `deweb-preview1`, region `asia-south1`;
- attaches the backend runtime service account;
- configures the public and business origins;
- configures Google authentication, Firestore, GCS and reCAPTCHA;
- maps `BUSINESS_UI_CSRF_SECRET` from Secret Manager;
- removes `BACKEND_ADMIN_TOKEN` from the public service;
- restricts ingress to internal and external load-balancer traffic;
- disables the default `run.app` URL;
- keeps the maximum instance count at one while public catalog sessions remain
  process-local.

Required shell variables:

```bash
export BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="admin1@gmail.com,admin2@gmail.com"
export RECAPTCHA_ENTERPRISE_SITE_KEY="<production-site-key>"
```

Optional override:

```bash
export RECAPTCHA_ENTERPRISE_PROJECT_ID="deweb-preview1"
```

The allowlist can also be read from the ignored local `.env`, but an explicit
shell export is clearer for production deployment.

### `npm run deploy:gcp:admin`

Creates or updates the separate `delta-backend-admin` Cloud Run service from
the current local working tree.

It:

- requires authenticated Cloud Run invocation;
- uses the dedicated `backend-admin-api-sa` runtime service account;
- verifies that only the admin runtime identity, not the public runtime
  identity, can read `BACKEND_ADMIN_TOKEN`;
- enables only `/api/internal/**` and `/api/health` at application level;
- maps `BACKEND_ADMIN_TOKEN` and `BUSINESS_UI_CSRF_SECRET` from Secret Manager;
- keeps browser origins blocked from internal routes;
- leaves the service URL enabled so approved operators can invoke it with an
  IAM identity token.

Required shell variable:

```bash
export BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="admin1@gmail.com,admin2@gmail.com"
```

The operator must also be granted `roles/run.invoker` on
`delta-backend-admin`.

## Are these commands enough?

They are enough for a **routine code revision deployment only after the
one-time GCP configuration is complete**.

They do not create or configure:

- the `darshanent.co.in` external Application Load Balancer;
- `/api` and `/api/*` URL-map routes to `delta-backend`;
- DNS or TLS certificates;
- Cloud Armor;
- OAuth Authorized JavaScript Origins;
- reCAPTCHA Enterprise keys;
- Firestore TTL policies;
- Secret Manager secret values or secret IAM permissions;
- runtime service-account IAM permissions;
- operator `roles/run.invoker` grants.

### Current deployment state

As verified on 19 July 2026:

- `delta-backend` exists and its default `run.app` URL is still enabled;
- `delta-backend-admin` does not exist yet;
- `BUSINESS_UI_CSRF_SECRET` exists;
- the dedicated `backend-admin-api-sa` identity exists and has the documented
  Firestore, catalog-bucket, signing, and secret permissions;
- only the dedicated admin runtime identity can read `BACKEND_ADMIN_TOKEN`;
- `https://darshanent.co.in/api/health` returns backend health JSON, confirming
  that the selected load-balancer API route is active.

## Which deployment command should I run?

| Change                                                            | Command                                                  |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| Public routes, business authentication, business catalog/messages | `npm run deploy:gcp`                                     |
| Internal Postman/operator routes only                             | `npm run deploy:gcp:admin`                               |
| Shared services, dependencies, DTOs, catalog or message logic     | Run both commands                                        |
| Documentation/frontend-only change                                | Neither backend command                                  |
| First production setup                                            | Complete the infrastructure runbook first, then run both |

Deployments are independent. Updating `delta-backend` does not update
`delta-backend-admin`, even though both use the same repository.

## Recommended routine deployment

```bash
git status --short
npm install
npm run lint
npm test -- --runInBand
npm run build

gcloud auth list
gcloud config set project deweb-preview1

export BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="admin1@gmail.com,admin2@gmail.com"
export RECAPTCHA_ENTERPRISE_SITE_KEY="<production-site-key>"

# Run only after darshanent.co.in/api is routed to delta-backend.
npm run deploy:gcp

# Run when internal or shared backend code must also be released.
npm run deploy:gcp:admin
```

These scripts deploy the current local files, including uncommitted changes.
Review `git status` and `git diff` before running them.

## Full deployment runbook

See [Plan/BACKEND_DEPLOYMENT_DOC.md](Plan/BACKEND_DEPLOYMENT_DOC.md) for:

- one-time infrastructure and IAM requirements;
- secret setup;
- safe deployment order;
- production verification;
- operator authentication;
- rollback commands.
