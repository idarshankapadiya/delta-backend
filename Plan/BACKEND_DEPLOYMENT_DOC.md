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
  → delta-backend-lb-service
  → asia-south1 delta-backend-neg
  → delta-backend

darshanent.co.in/*
  → delta-ui-firebase-lb-service
  → global delta-ui-firebase-neg
  → deweb-preview1.web.app
```

Firebase Hosting remains the public UI origin behind the load balancer. Do not
send `/api` through Firebase Hosting rewrites. The load-balancer path rule sends
API traffic directly to Cloud Run so application cookies are not processed by
the Firebase Hosting proxy.

## Current state: 19 July 2026

Production deployment and verification showed:

| Check                                          | Current result                                          |
| ---------------------------------------------- | ------------------------------------------------------- |
| `delta-backend`                                | Exists                                                  |
| Latest ready revision                          | `delta-backend-00012-78r`                               |
| Runtime service account                        | `backend-api-sa@deweb-preview1.iam.gserviceaccount.com` |
| Ingress                                        | `internal-and-cloud-load-balancing`                     |
| Default `run.app` URL                          | Disabled; former URL returns `404`                      |
| Load-balancer IP                               | `34.117.140.122`                                        |
| Serverless API NEG                             | `delta-backend-neg`                                     |
| Firebase UI internet NEG                       | `delta-ui-firebase-neg`                                 |
| HTTPS URL map                                  | `delta-ui-url-map`                                      |
| HTTP redirect URL map                          | `delta-ui-http-redirect-url-map`                        |
| HTTPS API/UI checks                            | Pass on apex and `www`                                  |
| HTTP-to-HTTPS redirect                         | Permanent redirect on apex and `www`                    |
| HTTPS certificate                              | `ACTIVE` for apex and `www`                             |
| Apex DNS                                       | Public `A` record points to `34.117.140.122`            |
| `www` DNS                                      | Public `A` record points to `34.117.140.122`            |
| `delta-backend-admin`                          | Does not exist                                          |
| Dedicated admin runtime account                | Exists                                                  |
| `BUSINESS_UI_CSRF_SECRET`                      | Exists                                                  |
| `BACKEND_ADMIN_TOKEN`                          | Exists                                                  |
| Public runtime access to `BACKEND_ADMIN_TOKEN` | Removed                                                 |
| Admin runtime access to `BACKEND_ADMIN_TOKEN`  | Granted                                                 |
| Production `/api/health`                       | Returns backend health JSON                             |
| Production public UI                           | Returns the Firebase-hosted UI                          |

Revision `delta-backend-00012-78r` contains both public and authenticated
business APIs and serves 100% of Cloud Run traffic. Production DNS, managed
TLS, HTTPS UI/API routing, HTTP-to-HTTPS redirect, load-balancer-only Cloud Run
ingress, and default-URL removal are complete. The separate
`delta-backend-admin` service still needs its first deployment only if internal
operator routes are required.

The admin deployment script now requires
`backend-admin-api-sa@deweb-preview1.iam.gserviceaccount.com` and refuses to
deploy if the public runtime identity can still read `BACKEND_ADMIN_TOKEN`.
The least-privilege identity and secret-policy setup is complete. Keep the
admin deployment preflight in place so future policy drift fails closed.

## What the two scripts do

### Public/business deployment

```bash
npm run deploy:gcp:user
```

Script: `scripts/deploy-gcp.sh`

Behavior:

- refuses to create `delta-backend` accidentally; the service must exist;
- deploys the current local source using Cloud Buildpacks;
- uses Node 24 from `package.json`;
- attaches
  `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`;
- refuses deployment unless both Google and Cloudflare public DNS resolvers
  return `34.117.140.122` for both production frontend hosts;
- refuses deployment until `delta-ui-cert` is `ACTIVE`;
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
```

Optional:

```bash
export RECAPTCHA_ENTERPRISE_PROJECT_ID="deweb-preview1"
export RECAPTCHA_ENTERPRISE_SITE_KEY="<production-site-key>"
```

When the reCAPTCHA site key is omitted, the deployment continues with a warning
and contact-form CAPTCHA verification remains disabled.

### Internal admin deployment

```bash
npm run deploy:gcp:admin
```

Script: `scripts/deploy-gcp-admin.sh`

Behavior:

- creates or updates `delta-backend-admin`;
- deploys the current local source;
- requires the dedicated `backend-admin-api-sa` runtime identity;
- refuses deployment unless that identity can read `BACKEND_ADMIN_TOKEN` and
  the public runtime identity cannot;
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

- run only `deploy:gcp:user` for public/business-only changes;
- run only `deploy:gcp:admin` for internal-controller-only changes;
- run `deploy:gcp` to prepare once and deploy both services when changing
  shared catalog/message services, dependencies, validation, configuration or
  security code.

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

The admin deployment script uses the dedicated `backend-admin-api-sa` runtime
identity and fails its preflight if the public runtime identity can read
`BACKEND_ADMIN_TOKEN`.

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

Implemented load-balancer resources:

| Resource              | Name                             |
| --------------------- | -------------------------------- |
| Global IPv4 address   | `delta-ui-public-ip`             |
| Managed certificate   | `delta-ui-cert`                  |
| Cloud Run NEG         | `delta-backend-neg`              |
| Firebase internet NEG | `delta-ui-firebase-neg`          |
| API backend service   | `delta-backend-lb-service`       |
| UI backend service    | `delta-ui-firebase-lb-service`   |
| HTTPS URL map         | `delta-ui-url-map`               |
| HTTP redirect URL map | `delta-ui-http-redirect-url-map` |
| HTTP proxy            | `delta-ui-http-proxy`            |
| HTTPS proxy           | `delta-ui-https-proxy`           |
| HTTP forwarding rule  | `delta-ui-http-forwarding-rule`  |
| HTTPS forwarding rule | `delta-ui-https-forwarding-rule` |

The HTTPS URL map sends `/api` and `/api/*` directly to the Cloud Run NEG and
everything else to `deweb-preview1.web.app` through the Firebase internet NEG.
The HTTP proxy uses the separate redirect URL map and permanently redirects
every request to the equivalent HTTPS URL. Its importable configuration is
`scripts/gcp/delta-ui-http-redirect-url-map.yaml`.

Production cutover completed on 19 July 2026:

1. Apex and `www` DNS resolve to `34.117.140.122`.
2. `delta-ui-cert` is `ACTIVE` for both names.
3. HTTPS UI, public API, business API/CORS, catalog, and route-boundary checks
   pass.
4. HTTP permanently redirects to HTTPS while preserving host, path, and query.
5. Cloud Run ingress is load-balancer-only and its default URL is disabled.

Attach a reviewed Cloud Armor policy later if edge WAF rules are required.

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
npm run deploy:gcp:prepare
```

This preparation command performs read-only linting, unit tests, e2e tests, and
the production build. To automatically fix lint errors before running it:

```bash
npm run lint:fix
```

Every production deployment command runs `deploy:gcp:prepare` automatically
and stops before invoking `gcloud` when a local check fails. The combined
`deploy:gcp` command prepares once, then runs the public and admin deployment
scripts sequentially. The commands are also available through Yarn, although
npm and `package-lock.json` remain canonical for this repository.

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
export RECAPTCHA_ENTERPRISE_PROJECT_ID="deweb-preview1"
# Optional until contact-form CAPTCHA enforcement is enabled:
export RECAPTCHA_ENTERPRISE_SITE_KEY="<production-site-key>"
```

For a complete release, run the combined command instead of steps 5 and 6:

```bash
npm run deploy:gcp
```

It deploys the public service first and the admin service second, stopping at
the first failure.

### 5. Deploy the public/business service

The deployment script requires both production hosts to resolve to the
load-balancer IP through Google and Cloudflare public DNS, and requires the
certificate to be active. Confirm DNS and certificate state first:

```bash
dig +short A darshanent.co.in @8.8.8.8
dig +short A www.darshanent.co.in @8.8.8.8
dig +short A darshanent.co.in @1.1.1.1
dig +short A www.darshanent.co.in @1.1.1.1

gcloud compute ssl-certificates describe delta-ui-cert \
  --project deweb-preview1 \
  --global \
  --format="yaml(managed.status,managed.domainStatus)"

curl --fail --silent https://darshanent.co.in/api/health |
  jq -e '.status == "ok"'

npm run deploy:gcp:user
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
