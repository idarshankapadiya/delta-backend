# GCP Cloud Run Deployment Plan

## Implemented Details

- Production entrypoint: `Procfile` runs `npm run start-backend:prod`.
- Runtime pin: `package.json` uses Node `24.x`.
- Node 24 GCS compatibility: `package.json` overrides `@google-cloud/storage` to use `gaxios@^7.1.5`, avoiding token fetch failures from the older nested request stack.
- Source deploy hygiene: `.gcloudignore` excludes local dependencies, build output, logs, and dotenv files.
- App listens on `HOST` and Cloud Run-managed `PORT`; use `HOST=0.0.0.0` in production.
- Cloud Run should use an attached service account; do not set `GOOGLE_APPLICATION_CREDENTIALS` in production.
- Local GCP key `/Users/darshankapadiya/.gcp/catalog-api-sa.json` belongs to `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`. Use this same service account as the Cloud Run runtime identity, but do not upload or mount the JSON private key in Cloud Run.

## Deployment Runbook

Run these commands from the backend repository root:

```bash
cd /Users/darshankapadiya/Developer/delta/delta-backend
```

### 1. Set deployment values

Replace `YOUR_CLOUD_RUN_REGION` with the real Cloud Run region.

```bash
export PROJECT_ID="deweb-preview1"
export REGION="YOUR_CLOUD_RUN_REGION"
export SERVICE_NAME="delta-backend"
export FRONTEND_URL="https://darshanent.co.in"

export PRIVATE_BUCKET="darshanent_catalog_dir"
export PUBLIC_BUCKET="darshanent-thumbnail-dir"
export FIRESTORE_DATABASE_ID="client-message-db"
export GOOGLE_CLIENT_ID="157686675107-rg7sc0uq9gb8c037fm4a7lqv2em10sk9.apps.googleusercontent.com"

export RUN_SA="backend-api-sa@deweb-preview1.iam.gserviceaccount.com"
```

Do not deploy these local-only values from `.env`:

- `PORT`: Cloud Run provides this automatically.
- `GOOGLE_APPLICATION_CREDENTIALS`: local-only path to `/Users/darshankapadiya/.gcp/catalog-api-sa.json`.

Credential decision:

- Local development can continue using `GOOGLE_APPLICATION_CREDENTIALS=/Users/darshankapadiya/.gcp/catalog-api-sa.json`.
- GCP production should use the same identity by attaching `backend-api-sa@deweb-preview1.iam.gserviceaccount.com` to Cloud Run.
- Do not store the JSON key file in Secret Manager, Cloud Run env vars, the repository, or the container image unless there is no other workable option.

### 2. Authenticate GCP CLI

```bash
gcloud auth login
gcloud auth application-default login
gcloud config set project "$PROJECT_ID"
```

### 3. Enable required APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  firestore.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  iamcredentials.googleapis.com
```

### 4. Confirm existing Cloud Run runtime service account

```bash
gcloud iam service-accounts describe "$RUN_SA"
```

Expected service account:

```txt
backend-api-sa@deweb-preview1.iam.gserviceaccount.com
```

If the deployer account cannot attach this service account to Cloud Run, grant the deployer `roles/iam.serviceAccountUser` on `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`.

### 5. Grant runtime permissions

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

### 6. Store admin token in Secret Manager

Use the real `BACKEND_ADMIN_TOKEN` value, not the local placeholder.

```bash
read -s BACKEND_ADMIN_TOKEN
printf "%s" "$BACKEND_ADMIN_TOKEN" | gcloud secrets create BACKEND_ADMIN_TOKEN --data-file=- \
  || printf "%s" "$BACKEND_ADMIN_TOKEN" | gcloud secrets versions add BACKEND_ADMIN_TOKEN --data-file=-
unset BACKEND_ADMIN_TOKEN
```

### 7. Optional local build check

```bash
npm install
npm run build
```

### 8. Deploy backend API to Cloud Run

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

Keep `--max-instances=1` until catalog sessions move out of process memory.

For Console UI deployment, choose this service account in the Cloud Run security settings:

```txt
backend-api-sa@deweb-preview1.iam.gserviceaccount.com
```

Do not add `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run environment variables.

## Verification

After deployment, get the Cloud Run URL from the deploy command output and verify:

```bash
export API_URL="https://YOUR_CLOUD_RUN_URL"

curl -i "$API_URL/api/health"
curl -i "$API_URL/api"
curl -i "$API_URL/api/catalog/all"
```

Check logs if verification fails:

```bash
gcloud run services logs read "$SERVICE_NAME" \
  --region "$REGION" \
  --limit=100
```

## Future Plan

- Disable, remove, or feature-flag public OTP routes until the feature is ready.
- Move catalog sessions and OTP challenges from process memory to Firestore or Redis.
- Configure email and WhatsApp OTP providers only when OTP access launches.
- Revisit Cloud Run scaling after durable session storage exists.
