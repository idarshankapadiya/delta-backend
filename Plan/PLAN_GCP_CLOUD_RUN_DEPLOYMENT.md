# GCP Cloud Run Future Deployment Plan

> Selected API URL: the production API base is
> `https://darshanent.co.in/api`.
> Route `/api` and `/api/*` to the backend serverless NEG using the main
> domain's external Application Load Balancer. See
> `PLAN_BUSINESS_API_SECURITY_DEPLOYMENT.md`.

## Summary

This file contains future deployment plans only. It is not the current production runbook.

- Current deployment details and current redeploy runbook live in `Plan/BACKEND_DEPLOYMENT_DOC.md`.
- Current working API base URL: `https://delta-backend-157686675107.asia-south1.run.app/api`.
- Main future goal: move the public backend API base URL to `https://darshanent.co.in/api`.
- Current Cloud Run service should remain working while the future domain is introduced.
- Do not execute any plan in this file unless the user explicitly asks for that work.
- Before execution, create a comprehensive implementation plan and get explicit approval.

## Future Plan: Move Backend API To `darshanent.co.in`

Move the public production API from the generated Cloud Run URL to the main
website's `/api` path.

```txt
Current API base:
https://delta-backend-157686675107.asia-south1.run.app/api

Future API base:
https://darshanent.co.in/api
```

The Cloud Run service should continue running as `delta-backend` in `asia-south1`. The custom domain should sit in front of Cloud Run through a Global External HTTPS Load Balancer.

### How It Differs From Current Deployment

- Current deployment exposes Cloud Run directly through the generated `run.app` URL.
- Future deployment adds a Global External HTTPS Load Balancer in front of Cloud Run.
- Current deployment does not require DNS, global static IP, managed certificate, forwarding rule, URL map, backend service, or serverless NEG.
- Future deployment requires DNS control for `darshanent.co.in`.
- Current frontend can call `https://delta-backend-157686675107.asia-south1.run.app/api`.
- Future frontend should call `https://darshanent.co.in/api`.
- Current Cloud Run ingress can remain public.
- Future deployment can optionally restrict Cloud Run ingress to internal/load-balancer traffic after the custom domain is stable.

### Pros

- Same-origin API URL aligned with `darshanent.co.in`.
- Stable frontend API contract independent of Google-generated Cloud Run URLs.
- Cleaner browser, CORS, logs, diagnostics, and production documentation story.
- Allows future load-balancer features such as Cloud Armor, centralized SSL, URL routing, redirects, and controlled ingress.
- Can be rolled out without breaking the current working Cloud Run URL.

### Challenges And Roadblocks

- Direct Cloud Run domain mapping is not available for the current `asia-south1` deployment path. A previous attempt returned: `Creating domain mappings is not allowed in asia-south1`.
- Global External HTTPS Load Balancer adds GCP resources and possible cost.
- Google-managed certificate activation depends on correct DNS and may take time.
- DNS changes require access to the authoritative DNS provider for `darshanent.co.in`.
- Misconfigured host rules, URL maps, backend services, serverless NEGs, or forwarding rules can cause 404/502 responses even when Cloud Run is healthy.
- Restricting Cloud Run ingress too early can make the API unavailable before the load balancer is fully verified.
- Frontend API base URL changes must be coordinated with frontend deployment and any browser/CDN cache behavior.

### Prerequisites

- Current backend is healthy:

```bash
export CURRENT_API_URL="https://delta-backend-157686675107.asia-south1.run.app"

curl -i "$CURRENT_API_URL/api/health"
curl -i "$CURRENT_API_URL/api"
curl -i "$CURRENT_API_URL/api/catalog/all"
```

- GCP project: `deweb-preview1`.
- Cloud Run service: `delta-backend`.
- Cloud Run region: `asia-south1`.
- GCP permissions to manage:
  - Global External HTTPS Load Balancer,
  - global static IP address,
  - Google-managed SSL certificate,
  - serverless NEG,
  - backend service,
  - URL map,
  - target HTTPS proxy,
  - global forwarding rule,
  - Cloud Run service ingress if it is restricted later.
- DNS access for `darshanent.co.in`.
- Decision on whether the default `run.app` URL should remain publicly reachable after custom domain verification.
- Frontend deployment path ready to switch production API base URL to `https://darshanent.co.in/api`.

### Implementation Plan

1. Verify the current Cloud Run URL before changing anything.
2. Reserve a global static IP address for the future API load balancer.
3. Create a Google-managed SSL certificate for `darshanent.co.in`.
4. Create a serverless NEG:
   - region: `asia-south1`,
   - target: Cloud Run service `delta-backend`.
5. Create a backend service using the serverless NEG.
6. Create a URL map:
   - host rule: `darshanent.co.in`,
   - path rules `/api` and `/api/*`: Cloud Run backend service,
   - default route `/*`: public UI backend service.
7. Create a target HTTPS proxy using the Google-managed certificate.
8. Create a global forwarding rule:
   - protocol: HTTPS,
   - port: `443`,
   - IP: reserved global static IP,
   - target: HTTPS proxy.
9. Add DNS record for `darshanent.co.in`:

```txt
Type: A
Name: @
Value: <global-load-balancer-ip>
```

10. Wait for DNS propagation and Google-managed certificate activation.
11. Verify the future custom domain:

```bash
export FUTURE_API_URL="https://darshanent.co.in"

curl -i "$FUTURE_API_URL/api/health"
curl -i "$FUTURE_API_URL/api"
curl -i "$FUTURE_API_URL/api/catalog/all"
```

12. Update frontend production API base URL:

```txt
https://darshanent.co.in/api
```

13. Deploy frontend and verify browser requests from `https://darshanent.co.in` to `https://darshanent.co.in/api`.
14. Monitor Cloud Run logs and load-balancer logs for 4xx/5xx responses.
15. After stable verification, consider restricting Cloud Run ingress to internal and load-balancer traffic.

### Acceptance Criteria

- `https://darshanent.co.in/api/health` returns `200`.
- `https://darshanent.co.in/api` returns the endpoint list.
- `https://darshanent.co.in/api/catalog/all` returns catalog JSON and not `503`.
- Google-managed certificate is active.
- Frontend production requests use `https://darshanent.co.in/api`.
- Existing Cloud Run URL remains healthy during migration.

## Future Plan: GitHub-Based Continuous Deployment

Move deployment source from local `gcloud run deploy --source .` to GitHub-triggered Cloud Run deployment.

### How It Differs From Current Deployment

- Current deployment is manually triggered from the local backend repository with `gcloud`.
- Future deployment builds from GitHub after changes are pushed.
- Current deployment uses Cloud Run source deploy and Google Cloud Buildpacks.
- Future GitHub deployment should also use Google Cloud Buildpacks.
- Dockerfile should not be selected unless a real `Dockerfile` is added and verified later.
- Current deployer is the authenticated local GCP user.
- Future deployer is the GitHub-connected Cloud Build trigger/service account.

### Pros

- Production revisions are built from version-controlled commits.
- Easier repeatability and auditability.
- Reduces dependency on one local machine having the correct GCP CLI/auth state.
- Enables predictable branch-based deployment from `main`.
- Keeps the same Buildpacks behavior that already works for this backend.

### Challenges And Roadblocks

- GitHub must contain the latest working deployment fixes before the trigger is trusted.
- If the setup is configured as Dockerfile with `/Dockerfile`, deployment will fail because the repo currently has no Dockerfile.
- Cloud Run env vars and Secret Manager mappings must stay in GCP, not GitHub.
- Cloud Build trigger/service account must have permission to build and deploy Cloud Run.
- A push to `main` can create a new production revision once the trigger is enabled.

### Prerequisites

- Current repository state is committed and pushed to GitHub, including:
  - `Procfile`,
  - `.gcloudignore`,
  - `package.json`,
  - `package-lock.json`,
  - backend source changes,
  - deployment docs under `Plan/`.
- Cloud Run service `delta-backend` already exists in `asia-south1`.
- Runtime service account remains `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`.
- Runtime env vars and `BACKEND_ADMIN_TOKEN` secret mapping match `Plan/BACKEND_DEPLOYMENT_DOC.md`.
- GitHub connection is authorized in GCP.
- Branch is `main` unless explicitly changed.

### Implementation Plan

1. Push the current backend repository state to GitHub.
2. In Cloud Run, choose service `delta-backend`.
3. Open continuous deployment setup.
4. Select the GitHub repository.
5. Use branch regex:

```txt
^main$
```

6. Select build type:

```txt
Go, Node.js, Python, Java, .NET Core, Ruby or PHP via Google Cloud's buildpacks
```

7. Set source directory/location:

```txt
/
```

8. Do not choose Dockerfile unless a future task adds and verifies a real Dockerfile.
9. Confirm service settings:
   - service: `delta-backend`,
   - region: `asia-south1`,
   - runtime service account: `backend-api-sa@deweb-preview1.iam.gserviceaccount.com`,
   - max instances: `1`,
   - memory: `2Gi`,
   - CPU: `1`,
   - timeout: `300`,
   - allow unauthenticated.
10. Confirm env vars and secret mapping match `Plan/BACKEND_DEPLOYMENT_DOC.md`.
11. Save trigger and allow first deployment.
12. Verify the new revision:

```bash
export API_URL="https://delta-backend-157686675107.asia-south1.run.app"

curl -i "$API_URL/api/health"
curl -i "$API_URL/api"
curl -i "$API_URL/api/catalog/all"
```

### Acceptance Criteria

- A GitHub push to `main` creates a Cloud Build build and a new Cloud Run revision.
- Revision uses Buildpacks and `Procfile`, not Dockerfile.
- Deployed service keeps the expected runtime service account.
- Deployed service keeps the expected env vars and `BACKEND_ADMIN_TOKEN` secret mapping.
- Current Cloud Run smoke checks stay green.

## Other Future Backend Deployment Plans

- Disable, remove, or feature-flag public OTP routes until the feature is ready.
- Move catalog sessions and OTP challenges from process memory to Firestore or Redis.
- Configure email and WhatsApp OTP providers only when OTP access launches.
- Revisit Cloud Run scaling after durable session storage exists.
