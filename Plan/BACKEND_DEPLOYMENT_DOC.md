# Backend Deployment Runbook

## Decision

Use two independent Cloud Run services built from this repository:

| Service               | Exposure                                      | Routes                                                   |
| --------------------- | --------------------------------------------- | -------------------------------------------------------- |
| `delta-backend`       | Public through `https://darshanent.co.in/api` | Public catalog/message and authenticated business routes |
| `delta-backend-admin` | Cloud Run IAM protected                       | `/api/internal/**` and `/api/health` only                |

The selected browser API base is:

```text
https://darshanent.co.in/api
```

The external Application Load Balancer must route:

```text
darshanent.co.in/api
darshanent.co.in/api/*
  → asia-south1 serverless NEG
  → delta-backend

darshanent.co.in/*
  → public UI backend
```

Do not use Firebase Hosting rewrites for the API. Firebase Hosting strips
incoming cookies other than `__session`, while this application intentionally
uses separate HttpOnly business and public catalog cookies.

## Current state: 5 July 2026

Read-only production checks showed:

| Check                                          | Current result                                          |
| ---------------------------------------------- | ------------------------------------------------------- |
| `delta-backend`                                | Exists                                                  |
| Latest ready revision                          | `delta-backend-00006-d49`                               |
| Runtime service account                        | `backend-api-sa@deweb-preview1.iam.gserviceaccount.com` |
| Ingress                                        | `all`                                                   |
| Default `run.app` URL                          | Enabled                                                 |
| `delta-backend-admin`                          | Does not exist                                          |
| `BUSINESS_UI_CSRF_SECRET`                      | Does not exist                                          |
| `BACKEND_ADMIN_TOKEN`                          | Exists                                                  |
| Public runtime access to `BACKEND_ADMIN_TOKEN` | Currently granted                                       |
| `https://darshanent.co.in/api/health`          | Returns frontend HTML, not backend JSON                 |
| Current Cloud Run `/api/health`                | Returns backend JSON                                    |

Consequently, the repository is code-ready but the selected
`darshanent.co.in/api` infrastructure is not ready.

Both deployment scripts currently attach
`backend-api-sa@deweb-preview1.iam.gserviceaccount.com`. This works
functionally, but it means a compromise of the public service identity could
read `BACKEND_ADMIN_TOKEN`. For least privilege:

1. create a dedicated runtime service account for `delta-backend-admin`;
2. grant `BACKEND_ADMIN_TOKEN` access only to that admin identity;
3. update `scripts/deploy-gcp-admin.sh` to use the admin identity;
4. remove the public runtime identity from the admin secret policy.

### Critical warning

Do not run:

```bash
npm run deploy:gcp
```

until `/api` and `/api/*` are routed through the load balancer to
`delta-backend`.

The script changes ingress to `internal-and-cloud-load-balancing` and disables
the default `run.app` URL. Without a working load-balancer path, that deployment
can make the public API unreachable.

## What the two scripts do

### Public/business deployment

```bash
npm run deploy:gcp
```

Script: `scripts/deploy-gcp.sh`

Behavior:

- refuses to create `delta-backend` accidentally; the service must exist;
- deploys the current local source using Cloud Buildpacks;
- uses Node 24 from `package.json`;
- attaches
  `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`;
- allows unauthenticated network invocation because public routes exist;
- relies on application guards for business authorization;
- restricts ingress to internal/load-balancer traffic;
- disables the default Cloud Run URL;
- configures exact public/business frontend origins;
- configures Google OAuth audience, Firestore, GCS and reCAPTCHA;
- maps `BUSINESS_UI_CSRF_SECRET` from Secret Manager;
- removes `BACKEND_ADMIN_TOKEN` from the public service;
- retains a one-instance limit because public catalog sessions and OTP state
  are still process-local.

Required deployment inputs:

```bash
export BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="admin1@gmail.com,admin2@gmail.com"
export RECAPTCHA_ENTERPRISE_SITE_KEY="<production-site-key>"
```

Optional:

```bash
export RECAPTCHA_ENTERPRISE_PROJECT_ID="deweb-preview1"
```

### Internal admin deployment

```bash
npm run deploy:gcp:admin
```

Script: `scripts/deploy-gcp-admin.sh`

Behavior:

- creates or updates `delta-backend-admin`;
- deploys the current local source;
- requires Cloud Run IAM authentication;
- leaves its default URL enabled for approved operators;
- exposes only `/api/internal/**` and `/api/health` at application level;
- rejects requests carrying browser `Origin`;
- requires `x-backend-admin-token` after IAM authentication;
- maps `BACKEND_ADMIN_TOKEN` and `BUSINESS_UI_CSRF_SECRET` from Secret Manager.

Required deployment input:

```bash
export BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="admin1@gmail.com,admin2@gmail.com"
```

## Are the commands enough?

For normal revision updates: yes, after prerequisites exist.

For initial production setup: no. The scripts deliberately do not provision
networking, IAM, OAuth, reCAPTCHA, Firestore TTL, or secret values.

The two services are independent:

- run only `deploy:gcp` for public/business-only changes;
- run only `deploy:gcp:admin` for internal-controller-only changes;
- run both when changing shared catalog/message services, dependencies,
  validation, configuration or security code.

## One-time prerequisites

### 1. Google Cloud resources

- Project: `deweb-preview1`
- Region: `asia-south1`
- Existing public service: `delta-backend`
- New private operator service: `delta-backend-admin`
- Runtime service account:
  `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`
- Firestore database: `client-message-db`
- Private catalog bucket: `darshanent_catalog_dir`
- Public thumbnail bucket: `darshanent-thumbnail-dir`

Enable:

```text
run.googleapis.com
cloudbuild.googleapis.com
artifactregistry.googleapis.com
firestore.googleapis.com
storage.googleapis.com
secretmanager.googleapis.com
iamcredentials.googleapis.com
iam.googleapis.com
recaptchaenterprise.googleapis.com
compute.googleapis.com
```

### 2. Runtime service-account IAM

The runtime service account needs:

- `roles/datastore.user` on the project;
- `roles/storage.objectUser` on both catalog buckets;
- `roles/iam.serviceAccountTokenCreator` on itself for signed GCS URLs;
- `roles/secretmanager.secretAccessor` on:
  - `BUSINESS_UI_CSRF_SECRET`;
  - `BACKEND_ADMIN_TOKEN` only for the dedicated admin runtime identity.

The deployer needs permission to deploy Cloud Run services and
`roles/iam.serviceAccountUser` on the runtime service account.

The current admin script uses the public runtime service account. Replace it
with a dedicated admin runtime identity before treating the services as a
strict IAM boundary.

Do not configure `GOOGLE_APPLICATION_CREDENTIALS` on Cloud Run. Cloud Run uses
the attached service account.

### 3. Secret Manager

Create strong independent values:

```text
BUSINESS_UI_CSRF_SECRET
BACKEND_ADMIN_TOKEN
```

`BUSINESS_UI_CSRF_SECRET` must contain at least 32 characters.

Create the CSRF secret when it is missing:

```bash
printf '%s' "$(openssl rand -base64 48)" |
  gcloud secrets create BUSINESS_UI_CSRF_SECRET \
    --project=deweb-preview1 \
    --replication-policy=automatic \
    --data-file=-
```

Grant the Cloud Run runtime service account access to read it:

```bash
gcloud secrets add-iam-policy-binding BUSINESS_UI_CSRF_SECRET \
  --project=deweb-preview1 \
  --member="serviceAccount:backend-api-sa@deweb-preview1.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

If the grant command returns:

```text
Secret [projects/157686675107/secrets/BUSINESS_UI_CSRF_SECRET] not found
```

then either the secret does not exist in `deweb-preview1` or the active
deployer account cannot view/manage it. Check first:

```bash
gcloud secrets list \
  --project=deweb-preview1 \
  --filter="name:BUSINESS_UI_CSRF_SECRET"
```

If the secret is absent, create it with the command above. If creation or IAM
updates fail with permission errors, grant the deployer Secret Manager Admin
or have a project administrator create the secret and add the
`roles/secretmanager.secretAccessor` binding for
`backend-api-sa@deweb-preview1.iam.gserviceaccount.com`.

Do not put secret values in:

- Git;
- frontend environment variables;
- Postman collection files;
- Cloud Run plain-text environment variables;
- deployment documentation.

### 4. Google authentication

- Configure the production web OAuth client ID used by the scripts.
- Add `https://business.darshanent.co.in` to Authorized JavaScript Origins.
- Configure `BUSINESS_UI_ALLOWED_GOOGLE_EMAILS` with only dashboard
  administrators.
- Require two-step verification for those accounts.

### 5. reCAPTCHA Enterprise

- Create a website key restricted to `darshanent.co.in`.
- Enable the reCAPTCHA Enterprise API.
- Provide the site key to:
  - the public frontend build;
  - `RECAPTCHA_ENTERPRISE_SITE_KEY` when deploying `delta-backend`.
- Ensure the runtime service account can create assessments.

### 6. Firestore TTL

Enable TTL for:

```text
business_sessions.expires_at
message_rate_limits.expires_at
```

### 7. Load balancer and DNS

Before deploying the hardened public service:

1. Reserve a global IP.
2. Create the Google-managed certificate for `darshanent.co.in`.
3. Create an `asia-south1` serverless NEG for `delta-backend`.
4. Route `/api` and `/api/*` to the backend service containing that NEG.
5. Route other paths to the public UI backend.
6. Point `darshanent.co.in` DNS to the load-balancer IP.
7. Attach Cloud Armor policies.
8. Verify that `/api/health` reaches Cloud Run before disabling the default
   Cloud Run URL.

Verification must inspect JSON, not only HTTP status. Firebase currently returns
the SPA HTML with status `200` for unknown `/api` paths.

Correct:

```bash
curl --fail --silent https://darshanent.co.in/api/health |
  jq -e '.status == "ok"'
```

Incorrect:

```bash
curl --head https://darshanent.co.in/api/health
```

An HTTP `200` alone does not prove that the backend received the request.

### 8. Admin-service IAM

After creating `delta-backend-admin`, grant `roles/run.invoker` only to approved
operator user accounts or groups. Do not grant it to `allUsers`.

## Routine deployment runbook

### 1. Review the source being deployed

The scripts deploy the current local directory, including uncommitted files.

```bash
cd /Users/darshankapadiya/Developer/delta/delta-backend
git status --short
git diff --check
```

Commit or intentionally review every local change before production deployment.

### 2. Verify locally

```bash
npm install
npm run lint
npm test -- --runInBand
npm run build
```

For a full release, also run:

```bash
BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="test-admin@gmail.com" \
BUSINESS_UI_CSRF_SECRET="12345678901234567890123456789012" \
BUSINESS_UI_GOOGLE_CLIENT_ID="test-client-id" \
FIRESTORE_DATABASE_ID="test" \
npm run test:e2e -- --runInBand
```

### 3. Authenticate the deployer

```bash
gcloud auth login
gcloud auth list
gcloud config set project deweb-preview1
gcloud config set run/region asia-south1
```

Application Default Credentials are not required merely to run the deployment
scripts. Do not confuse local application credentials with the Cloud Run
runtime service account.

### 4. Set deployment inputs

```bash
export BUSINESS_UI_ALLOWED_GOOGLE_EMAILS="admin1@gmail.com,admin2@gmail.com"
export RECAPTCHA_ENTERPRISE_SITE_KEY="<production-site-key>"
export RECAPTCHA_ENTERPRISE_PROJECT_ID="deweb-preview1"
```

### 5. Deploy the public/business service

Only after the load-balancer `/api` route returns backend JSON:

```bash
curl --fail --silent https://darshanent.co.in/api/health |
  jq -e '.status == "ok"'

npm run deploy:gcp
```

### 6. Deploy the internal admin service

Run this for the first admin deployment and whenever internal/shared backend
code changes:

```bash
npm run deploy:gcp:admin
```

Then grant or confirm operator invocation permission:

```bash
gcloud run services add-iam-policy-binding delta-backend-admin \
  --project deweb-preview1 \
  --region asia-south1 \
  --member="user:approved-operator@example.com" \
  --role="roles/run.invoker"
```

Replace the example operator with the real approved identity.

## Post-deployment verification

### Public/business service

```bash
curl --fail --silent https://darshanent.co.in/api/health |
  jq -e '.status == "ok"'

curl --fail --silent https://darshanent.co.in/api |
  jq -e '.base_path == "/api"'
```

Confirm the service boundary:

```bash
curl -i https://darshanent.co.in/api/internal/messages
```

Expected: `404`.

Confirm the direct URL is disabled:

```bash
gcloud run services describe delta-backend \
  --project deweb-preview1 \
  --region asia-south1 \
  --format="yaml(metadata.annotations,status.url,status.latestReadyRevisionName)"
```

### Admin service

Obtain its URL:

```bash
ADMIN_URL="$(
  gcloud run services describe delta-backend-admin \
    --project deweb-preview1 \
    --region asia-south1 \
    --format='value(status.url)'
)"
```

Create an IAM identity token:

```bash
IDENTITY_TOKEN="$(gcloud auth print-identity-token)"
```

This user-token form is appropriate for an approved human operator using
`gcloud`. For production automation, impersonate a dedicated service account
and request an audience-restricted token for `$ADMIN_URL`.

Read the second factor without printing it:

```bash
read -s BACKEND_ADMIN_TOKEN
```

Call the internal health endpoint with IAM:

```bash
curl --fail --silent \
  -H "Authorization: Bearer $IDENTITY_TOKEN" \
  "$ADMIN_URL/api/health" |
  jq -e '.status == "ok"'
```

Call an internal route with both factors:

```bash
curl --fail --silent \
  -H "Authorization: Bearer $IDENTITY_TOKEN" \
  -H "x-backend-admin-token: $BACKEND_ADMIN_TOKEN" \
  "$ADMIN_URL/api/internal/messages" |
  jq -e '.messages | type == "array"'

unset IDENTITY_TOKEN BACKEND_ADMIN_TOKEN
```

### Logs

```bash
gcloud run services logs read delta-backend \
  --project deweb-preview1 \
  --region asia-south1 \
  --limit=100

gcloud run services logs read delta-backend-admin \
  --project deweb-preview1 \
  --region asia-south1 \
  --limit=100
```

## Rollback

List revisions:

```bash
gcloud run revisions list \
  --project deweb-preview1 \
  --region asia-south1 \
  --service delta-backend
```

Send all traffic to a known-good revision:

```bash
gcloud run services update-traffic delta-backend \
  --project deweb-preview1 \
  --region asia-south1 \
  --to-revisions="<known-good-revision>=100"
```

Use the same commands with `delta-backend-admin` when rolling back the admin
service.

Rolling back Cloud Run does not roll back:

- secrets;
- IAM policy;
- DNS;
- load-balancer configuration;
- Firestore TTL;
- frontend deployments.

Treat those as separate operational changes.

## Common failures

### `delta-backend` does not exist

`deploy-gcp.sh` intentionally refuses to create it. Verify project and region.

### `/api/health` returns HTML

The load balancer/Firebase route is serving the SPA. Do not deploy the hardened
public service yet. Fix `/api` URL-map routing.

### Google login returns `origin_mismatch`

Add `https://business.darshanent.co.in` to the OAuth client's Authorized
JavaScript Origins.

### Business login returns `403`

Check:

- normalized `BUSINESS_UI_ALLOWED_GOOGLE_EMAILS`;
- Workspace `hd` claim requirements;
- `business_users/{sub}` status and subject binding;
- the exact `https://business.darshanent.co.in` request origin.

### Catalog returns `503`

Check:

- Cloud Run logs;
- attached runtime service account;
- both bucket IAM policies;
- `roles/iam.serviceAccountTokenCreator` for signed URLs;
- Firestore/GCS environment configuration;
- Node 24 dependency overrides.

### Admin service returns `403` before NestJS

The caller is missing Cloud Run `roles/run.invoker` or a valid identity token.

### Admin service returns `401` from NestJS

IAM succeeded, but `x-backend-admin-token` is missing or incorrect.

### Deploy fails on `BUSINESS_UI_CSRF_SECRET`

Error:

```text
Permission denied on secret: projects/157686675107/secrets/BUSINESS_UI_CSRF_SECRET/versions/latest
```

The Cloud Run revision service account cannot access the secret. Confirm the
secret exists and grant:

```bash
gcloud secrets list \
  --project=deweb-preview1 \
  --filter="name:BUSINESS_UI_CSRF_SECRET"

gcloud secrets add-iam-policy-binding BUSINESS_UI_CSRF_SECRET \
  --project=deweb-preview1 \
  --member="serviceAccount:backend-api-sa@deweb-preview1.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

If the grant command returns `404 Secret not found`, create the secret first
or ask a project administrator to create it. A `404` can also indicate that the
active deployer account lacks Secret Manager visibility/admin permissions.
