#!/usr/bin/env bash

set -Eeuo pipefail

readonly PROJECT_ID="deweb-preview1"
readonly REGION="asia-south1"
readonly SERVICE_NAME="delta-backend"
readonly RUN_SERVICE_ACCOUNT="backend-api-sa@deweb-preview1.iam.gserviceaccount.com"
readonly BUSINESS_CSRF_SECRET="BUSINESS_UI_CSRF_SECRET"
readonly LOAD_BALANCER_IP="34.117.140.122"
readonly LOAD_BALANCER_CERTIFICATE="delta-ui-cert"
readonly DNS_RESOLVERS=("8.8.8.8" "1.1.1.1")

readonly FRONTEND_URL="https://darshanent.co.in"
readonly PUBLIC_FRONTEND_ORIGINS="${FRONTEND_URL},https://www.darshanent.co.in"
readonly BUSINESS_FRONTEND_URL="https://business.darshanent.co.in"
readonly PRIVATE_BUCKET="darshanent_catalog_dir"
readonly PUBLIC_BUCKET="darshanent-thumbnail-dir"
readonly PRODUCT_BUCKET="darshanent_product_dir"
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

if ! command -v dig >/dev/null 2>&1; then
  echo "Error: dig is required to verify the production DNS cutover." >&2
  exit 1
fi

for frontend_host in "darshanent.co.in" "www.darshanent.co.in"; do
  for dns_resolver in "${DNS_RESOLVERS[@]}"; do
    resolved_ips="$(dig +short A "$frontend_host" "@$dns_resolver" | sort -u)"

    if ! grep -Fqx "$LOAD_BALANCER_IP" <<<"$resolved_ips"; then
      echo "Error: $frontend_host must resolve to load balancer IP $LOAD_BALANCER_IP through DNS resolver $dns_resolver before deployment." >&2
      exit 1
    fi
  done
done

ACTIVE_ACCOUNT="$(gcloud auth list --filter="status:ACTIVE" --format="value(account)" | head -n 1)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  echo "Error: no active gcloud account. Run 'gcloud auth login' first." >&2
  exit 1
fi

LOAD_BALANCER_CERTIFICATE_STATUS="$(
  gcloud compute ssl-certificates describe "$LOAD_BALANCER_CERTIFICATE" \
    --project "$PROJECT_ID" \
    --global \
    --format="value(managed.status)"
)"

if [[ "$LOAD_BALANCER_CERTIFICATE_STATUS" != "ACTIVE" ]]; then
  echo "Error: load balancer certificate '$LOAD_BALANCER_CERTIFICATE' must be ACTIVE before Cloud Run ingress is restricted and its default URL is disabled (current status: $LOAD_BALANCER_CERTIFICATE_STATUS)." >&2
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
  --ingress internal-and-cloud-load-balancing \
  --no-default-url \
  --max-instances=1 \
  --memory=2Gi \
  --cpu=1 \
  --timeout=300 \
  --update-env-vars "^~^NODE_ENV=production~HOST=0.0.0.0~PUBLIC_FRONTEND_ORIGIN=$PUBLIC_FRONTEND_ORIGINS~BUSINESS_FRONTEND_ORIGIN=$BUSINESS_FRONTEND_URL~FRONTEND_BASE_URL=$FRONTEND_URL~CATALOG_GOOGLE_REDIRECT_URL=$FRONTEND_URL~GCS_CATALOG_BUCKET=$PRIVATE_BUCKET~GCS_CATALOG_PREFIX=~GCS_CATALOG_PUBLIC_ASSET_BUCKET=$PUBLIC_BUCKET~CATALOG_PUBLIC_ASSET_BASE_URL=https://storage.googleapis.com/$PUBLIC_BUCKET~CATALOG_SIGNED_URL_TTL_SECONDS=900~GCS_PRODUCT_BUCKET=$PRODUCT_BUCKET~PRODUCT_FIRESTORE_DATABASE_ID=$FIRESTORE_DATABASE_ID~PRODUCT_ASSET_DELIVERY=signed~PRODUCT_SIGNED_URL_TTL_SECONDS=3600~GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID~BUSINESS_UI_GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID~FIRESTORE_DATABASE_ID=$FIRESTORE_DATABASE_ID~BUSINESS_UI_ALLOWED_GOOGLE_EMAILS=$BUSINESS_ALLOWED_EMAILS~RECAPTCHA_ENTERPRISE_PROJECT_ID=$RECAPTCHA_PROJECT_ID~RECAPTCHA_ENTERPRISE_SITE_KEY=$RECAPTCHA_SITE_KEY~INTERNAL_ADMIN_API_ENABLED=false~INTERNAL_ADMIN_SERVICE_ONLY=false" \
  --remove-env-vars "BACKEND_ADMIN_TOKEN,FRONTEND_ORIGIN" \
  --update-secrets "BUSINESS_UI_CSRF_SECRET=$BUSINESS_CSRF_SECRET:latest" \
  --remove-secrets "BACKEND_ADMIN_TOKEN" \
  --quiet

LATEST_REVISION="$(gcloud run services describe "$SERVICE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format="value(status.latestReadyRevisionName)")"

delete_preflight_headers="$(
  curl --fail --silent --show-error \
    -D - \
    -o /dev/null \
    -X OPTIONS \
    -H "Origin: ${BUSINESS_FRONTEND_URL}" \
    -H "Access-Control-Request-Method: DELETE" \
    -H "Access-Control-Request-Headers: x-csrf-token" \
    "${FRONTEND_URL}/api/business/catalog/documents/preflight-check"
)"

if ! grep -Fqi "access-control-allow-origin: ${BUSINESS_FRONTEND_URL}" <<<"$delete_preflight_headers"; then
  echo "Error: deployed backend CORS does not allow ${BUSINESS_FRONTEND_URL}." >&2
  exit 1
fi

if ! grep -Eiq 'access-control-allow-methods:.*\bDELETE\b' <<<"$delete_preflight_headers"; then
  echo "Error: deployed backend CORS does not allow DELETE preflight requests." >&2
  exit 1
fi

echo "Deployment complete: $LATEST_REVISION"
echo "Verify through https://darshanent.co.in/api/health and https://www.darshanent.co.in/api/health."
