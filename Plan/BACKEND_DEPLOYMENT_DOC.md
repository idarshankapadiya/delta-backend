# Backend Deployment Doc

## Summary

The backend is currently deployed to Google Cloud Run and is working through the default Cloud Run service URL.

- Current Cloud Run service URL: `https://delta-backend-157686675107.asia-south1.run.app`
- Current API base URL: `https://delta-backend-157686675107.asia-south1.run.app/api`
- Current project: `deweb-preview1`
- Current region: `asia-south1`
- Current service: `delta-backend`
- Current verified revision: `delta-backend-00003-rqh`
- Current runtime service account: `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`
- Current build method: Cloud Run source deploy with Google Cloud Buildpacks.
- Current entrypoint: `Procfile` runs `npm run start-backend:prod`.
- Current Node runtime: `package.json` pins Node `24.x`.
- Current smoke checks pass for `/api/health`, `/api`, and `/api/catalog/all`.

## Implemented Deployment Details

- Production entrypoint: `Procfile` runs `npm run start-backend:prod`.
- Runtime pin: `package.json` uses Node `24.x`.
- Node 24 GCS compatibility: `package.json` overrides `@google-cloud/storage` to use `gaxios@^7.1.5` and `gcp-metadata@^8.1.3`, avoiding token fetch failures from the older nested request/metadata stack.
- Source deploy hygiene: `.gcloudignore` excludes local dependencies, build output, logs, and dotenv files.
- App listens on `HOST` and Cloud Run-managed `PORT`; production uses `HOST=0.0.0.0`.
- Cloud Run uses an attached service account; production does not set `GOOGLE_APPLICATION_CREDENTIALS`.
- Local GCP key `/Users/darshankapadiya/.gcp/catalog-api-sa.json` belongs to `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`. This identity is attached to Cloud Run as the runtime identity, but the JSON private key is not uploaded, mounted, stored in Secret Manager, added to Cloud Run env vars, committed, or baked into the container image.
- `BACKEND_ADMIN_TOKEN` is stored in Secret Manager and attached to Cloud Run as `BACKEND_ADMIN_TOKEN=BACKEND_ADMIN_TOKEN:latest`.
- `--max-instances=1` is intentionally used until catalog sessions move out of process memory.

## Current Production URLs

```txt
Cloud Run service:
https://delta-backend-157686675107.asia-south1.run.app

API base:
https://delta-backend-157686675107.asia-south1.run.app/api

Health:
https://delta-backend-157686675107.asia-south1.run.app/api/health

Endpoint index:
https://delta-backend-157686675107.asia-south1.run.app/api

Catalog:
https://delta-backend-157686675107.asia-south1.run.app/api/catalog/all
```

## Current Environment And Secrets

Runtime env vars used by Cloud Run:

```env
NODE_ENV=production
HOST=0.0.0.0
FRONTEND_ORIGIN=https://darshanent.co.in
FRONTEND_BASE_URL=https://darshanent.co.in
GCS_CATALOG_BUCKET=darshanent_catalog_dir
GCS_CATALOG_PREFIX=
GCS_CATALOG_PUBLIC_ASSET_BUCKET=darshanent-thumbnail-dir
CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/darshanent-thumbnail-dir
CATALOG_SIGNED_URL_TTL_SECONDS=900
GOOGLE_CLIENT_ID=157686675107-rg7sc0uq9gb8c037fm4a7lqv2em10sk9.apps.googleusercontent.com
FIRESTORE_DATABASE_ID=client-message-db
```

Runtime secret mapping:

```txt
BACKEND_ADMIN_TOKEN=BACKEND_ADMIN_TOKEN:latest
```

Local-only values that should not be deployed to Cloud Run:

- `PORT`: Cloud Run provides this automatically.
- `GOOGLE_APPLICATION_CREDENTIALS`: local-only path to `/Users/darshankapadiya/.gcp/catalog-api-sa.json`.

## Current GCP Resources

- Project: `deweb-preview1`
- Cloud Run service: `delta-backend`
- Cloud Run region: `asia-south1`
- Runtime service account: `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`
- Private catalog bucket: `darshanent_catalog_dir`
- Public thumbnail bucket: `darshanent-thumbnail-dir`
- Firestore database: `client-message-db`
- Secret Manager secret: `BACKEND_ADMIN_TOKEN`

Required enabled APIs:

```txt
run.googleapis.com
cloudbuild.googleapis.com
artifactregistry.googleapis.com
firestore.googleapis.com
storage.googleapis.com
secretmanager.googleapis.com
iamcredentials.googleapis.com
iam.googleapis.com
```

Runtime permissions:

- `roles/datastore.user` for `backend-api-sa@deweb-preview1.iam.gserviceaccount.com` on project `deweb-preview1`.
- `roles/storage.objectUser` for the runtime service account on `gs://darshanent_catalog_dir`.
- `roles/storage.objectUser` for the runtime service account on `gs://darshanent-thumbnail-dir`.
- `roles/secretmanager.secretAccessor` for the runtime service account on `BACKEND_ADMIN_TOKEN`.
- `roles/iam.serviceAccountTokenCreator` for the runtime service account on itself, supporting signed Cloud Storage URLs.

## Deployment Runbook

Run these commands from the backend repository root:

```bash
cd /Users/darshankapadiya/Developer/delta/delta-backend
```

### 1. Set Deployment Values

```bash
export PROJECT_ID="deweb-preview1"
export REGION="asia-south1"
export SERVICE_NAME="delta-backend"
export FRONTEND_URL="https://darshanent.co.in"

export PRIVATE_BUCKET="darshanent_catalog_dir"
export PUBLIC_BUCKET="darshanent-thumbnail-dir"
export FIRESTORE_DATABASE_ID="client-message-db"
export GOOGLE_CLIENT_ID="157686675107-rg7sc0uq9gb8c037fm4a7lqv2em10sk9.apps.googleusercontent.com"

export RUN_SA="backend-api-sa@deweb-preview1.iam.gserviceaccount.com"
```

### 2. Authenticate GCP CLI

Use a deployer account that can enable services, manage Cloud Run, attach the runtime service account, write IAM policy bindings, create/read Secret Manager secrets, and run Cloud Build.

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"
```

Local development may continue using:

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/Users/darshankapadiya/.gcp/catalog-api-sa.json"
```

Do not deploy that value to Cloud Run.

### 3. Enable Required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com \
  iam.googleapis.com
```

### 4. Confirm Runtime Service Account

```bash
gcloud iam service-accounts describe "$RUN_SA"
```

Expected service account:

```txt
backend-api-sa@deweb-preview1.iam.gserviceaccount.com
```

If the deployer account cannot attach this service account to Cloud Run, grant the deployer `roles/iam.serviceAccountUser` on this service account.

### 5. Grant Runtime Permissions

Firestore access:

```bash
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/datastore.user"
```

Private catalog bucket access:

```bash
gcloud storage buckets add-iam-policy-binding "gs://$PRIVATE_BUCKET" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/storage.objectUser"
```

Public catalog asset bucket access:

```bash
gcloud storage buckets add-iam-policy-binding "gs://$PUBLIC_BUCKET" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/storage.objectUser"
```

Secret Manager access for `BACKEND_ADMIN_TOKEN`:

```bash
gcloud secrets add-iam-policy-binding BACKEND_ADMIN_TOKEN \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/secretmanager.secretAccessor"
```

Signed Cloud Storage URL support:

```bash
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
  --member="serviceAccount:$RUN_SA" \
  --role="roles/iam.serviceAccountTokenCreator"
```

### 6. Store Admin Token In Secret Manager

Use the real `BACKEND_ADMIN_TOKEN` value, not a local placeholder.

```bash
read -s BACKEND_ADMIN_TOKEN
printf "%s" "$BACKEND_ADMIN_TOKEN" | gcloud secrets create BACKEND_ADMIN_TOKEN --data-file=- \
  || printf "%s" "$BACKEND_ADMIN_TOKEN" | gcloud secrets versions add BACKEND_ADMIN_TOKEN --data-file=-
unset BACKEND_ADMIN_TOKEN
```

### 7. Optional Local Build Check

```bash
npm install
npm run build
```

The local machine may warn if its Node version is not `24.x`; Cloud Run buildpacks use the runtime specified by `package.json`.

### 8. Deploy Backend API To Cloud Run

```bash
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SA" \
  --allow-unauthenticated \
  --max-instances=1 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=300 \
  --set-env-vars "NODE_ENV=production,HOST=0.0.0.0,FRONTEND_ORIGIN=$FRONTEND_URL,FRONTEND_BASE_URL=$FRONTEND_URL,GCS_CATALOG_BUCKET=$PRIVATE_BUCKET,GCS_CATALOG_PREFIX=,GCS_CATALOG_PUBLIC_ASSET_BUCKET=$PUBLIC_BUCKET,CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/$PUBLIC_BUCKET,CATALOG_SIGNED_URL_TTL_SECONDS=900,GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID,FIRESTORE_DATABASE_ID=$FIRESTORE_DATABASE_ID" \
  --set-secrets "BACKEND_ADMIN_TOKEN=BACKEND_ADMIN_TOKEN:latest"
```

For Console UI deployment, choose this service account in Cloud Run security settings:

```txt
backend-api-sa@deweb-preview1.iam.gserviceaccount.com
```

Do not add `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run environment variables.

## Verification

Current deployed URL:

```bash
export API_URL="https://delta-backend-157686675107.asia-south1.run.app"
```

Smoke checks:

```bash
curl -i "$API_URL/api/health"
curl -i "$API_URL/api"
curl -i "$API_URL/api/catalog/all"
```

Expected results:

- `/api/health` returns `200` with backend health JSON.
- `/api` returns the endpoint index.
- `/api/catalog/all` returns catalog JSON and not `503`.

Check logs if verification fails:

```bash
gcloud run services logs read "$SERVICE_NAME" \
  --region "$REGION" \
  --limit=100
```

Confirm active revision and runtime identity:

```bash
gcloud run services describe "$SERVICE_NAME" \
  --region "$REGION" \
  --format="value(status.latestReadyRevisionName,status.traffic[0].percent,spec.template.spec.serviceAccountName)"
```
