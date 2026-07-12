#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ID="deweb-preview1"
readonly REGION="asia-south1"
readonly SERVICE_NAME="delta-backend"
readonly RUN_SERVICE_ACCOUNT="backend-api-sa@deweb-preview1.iam.gserviceaccount.com"
readonly BUSINESS_CSRF_SECRET="BUSINESS_UI_CSRF_SECRET"

readonly FRONTEND_URL="https://darshanent.co.in"
readonly PUBLIC_FRONTEND_ORIGINS="${FRONTEND_URL},https://www.darshanent.co.in"
readonly BUSINESS_FRONTEND_URL="https://business.darshanent.co.in"
readonly PRIVATE_BUCKET="darshanent_catalog_dir"
readonly PUBLIC_BUCKET="darshanent-thumbnail-dir"
readonly FIRESTORE_DATABASE_ID="client-message-db"
readonly GOOGLE_CLIENT_ID="157686675107-rg7sc0uq9gb8c037fm4a7lqv2em10sk9.apps.googleusercontent.com"
readonly RECAPTCHA_PROJECT_ID="${RECAPTCHA_ENTERPRISE_PROJECT_ID:-$PROJECT_ID}"
readonly RECAPTCHA_SITE_KEY="${RECAPTCHA_ENTERPRISE_SITE_KEY:-}"

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUSINESS_ALLOWED_EMAILS="${BUSINESS_UI_ALLOWED_GOOGLE_EMAILS:-}"

if [[ -z "$BUSINESS_ALLOWED_EMAILS" && -f "$REPOSITORY_ROOT/.env" ]]; then
  BUSINESS_ALLOWED_EMAILS="$(
    awk -F= '
      $1 == "BUSINESS_UI_ALLOWED_GOOGLE_EMAILS" {
        print substr($0, index($0, "=") + 1)
      }
    ' "$REPOSITORY_ROOT/.env" | tail -n 1
  )"
fi

if [[ -z "$BUSINESS_ALLOWED_EMAILS" ]]; then
  echo "Error: BUSINESS_UI_ALLOWED_GOOGLE_EMAILS is required." >&2
  exit 1
fi

readonly BUSINESS_ALLOWED_EMAILS

if [[ -z "$RECAPTCHA_SITE_KEY" ]]; then
  echo "Warning: RECAPTCHA_ENTERPRISE_SITE_KEY is not set; contact form CAPTCHA verification will be skipped." >&2
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

echo "Deploying as: $ACTIVE_ACCOUNT"
echo "Target: $PROJECT_ID / $REGION / $SERVICE_NAME"

# Refuse to create a new service accidentally. This command is intended to
# replace the existing service revision and move traffic to the new revision.
if ! gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  >/dev/null 2>&1; then
  echo "Error: Cloud Run service '$SERVICE_NAME' does not exist in $PROJECT_ID/$REGION." >&2
  exit 1
fi

cd "$REPOSITORY_ROOT"

gcloud run deploy "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --source . \
  --region "$REGION" \
  --service-account "$RUN_SERVICE_ACCOUNT" \
  --allow-unauthenticated \
  --ingress all \
  --default-url \
  --max-instances=1 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=300 \
  --update-env-vars "^~^NODE_ENV=production~HOST=0.0.0.0~PUBLIC_FRONTEND_ORIGIN=$PUBLIC_FRONTEND_ORIGINS~BUSINESS_FRONTEND_ORIGIN=$BUSINESS_FRONTEND_URL~FRONTEND_BASE_URL=$FRONTEND_URL~CATALOG_GOOGLE_REDIRECT_URL=$FRONTEND_URL~GCS_CATALOG_BUCKET=$PRIVATE_BUCKET~GCS_CATALOG_PREFIX=~GCS_CATALOG_PUBLIC_ASSET_BUCKET=$PUBLIC_BUCKET~CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/$PUBLIC_BUCKET~CATALOG_SIGNED_URL_TTL_SECONDS=900~GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID~BUSINESS_UI_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID~FIRESTORE_DATABASE_ID=$FIRESTORE_DATABASE_ID~BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=$BUSINESS_ALLOWED_EMAILS~RECAPTCHA_ENTERPRISE_PROJECT_ID=$RECAPTCHA_PROJECT_ID~RECAPTCHA_ENTERPRISE_SITE_KEY=$RECAPTCHA_SITE_KEY~INTERNAL_ADMIN_API_ENABLED=false~INTERNAL_ADMIN_SERVICE_ONLY=false" \
  --remove-env-vars "BACKEND_ADMIN_TOKEN" \
  --update-secrets "BUSINESS_UI_CSRF_SECRET=$BUSINESS_CSRF_SECRET:latest" \
  --remove-secrets "BACKEND_ADMIN_TOKEN" \
  --quiet

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format="value(status.url)")"

echo "Deployment complete: $SERVICE_URL"
echo "Verify through https://darshanent.co.in/api/health, https://www.darshanent.co.in/api/health, and ${SERVICE_URL}/api/health."
