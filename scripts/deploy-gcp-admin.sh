#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ID="deweb-preview1"
readonly REGION="asia-south1"
readonly SERVICE_NAME="delta-backend-admin"
readonly RUN_SERVICE_ACCOUNT="backend-api-sa@deweb-preview1.iam.gserviceaccount.com"
readonly ADMIN_TOKEN_SECRET="BACKEND_ADMIN_TOKEN"
readonly BUSINESS_CSRF_SECRET="BUSINESS_UI_CSRF_SECRET"
readonly PRIVATE_BUCKET="darshanent_catalog_dir"
readonly PUBLIC_BUCKET="darshanent-thumbnail-dir"
readonly FIRESTORE_DATABASE_ID="client-message-db"

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUSINESS_ALLOWED_EMAILS="${BUSINESS_UI_ALLOWED_GOOGLE_EMAILS:-}"

if [[ -z "$BUSINESS_ALLOWED_EMAILS" ]]; then
  echo "Error: BUSINESS_UI_ALLOWED_GOOGLE_EMAILS is required." >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Error: gcloud CLI is required but was not found." >&2
  exit 1
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter="status:ACTIVE" --format="value(account)" | head -n 1)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "Error: no active gcloud account. Run 'gcloud auth login' first." >&2
  exit 1
fi

echo "Deploying IAM-protected admin service as: $ACTIVE_ACCOUNT"
echo "Target: $PROJECT_ID / $REGION / $SERVICE_NAME"

cd "$REPOSITORY_ROOT"

gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SERVICE_ACCOUNT" \
  --no-allow-unauthenticated \
  --ingress all \
  --default-url \
  --max-instances=1 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=300 \
  --set-env-vars "^@^NODE_ENV=production@HOST=0.0.0.0@GCS_CATALOG_BUCKET=$PRIVATE_BUCKET@GCS_CATALOG_PREFIX=@GCS_CATALOG_PUBLIC_ASSET_BUCKET=$PUBLIC_BUCKET@CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/$PUBLIC_BUCKET@FIRESTORE_DATABASE_ID=$FIRESTORE_DATABASE_ID@BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=$BUSINESS_ALLOWED_EMAILS@INTERNAL_ADMIN_API_ENABLED=true@INTERNAL_ADMIN_SERVICE_ONLY=true" \
  --set-secrets "BACKEND_ADMIN_TOKEN=$ADMIN_TOKEN_SECRET:latest,BUSINESS_UI_CSRF_SECRET=$BUSINESS_CSRF_SECRET:latest" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format="value(status.url)")"

echo "Deployment complete: $SERVICE_URL"
echo "Invoke it with an approved Google identity token plus x-backend-admin-token."
