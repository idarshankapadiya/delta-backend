# Contact Messages: Firestore Backend And UI Plan

## Summary

Use the existing GCP project’s **Firestore Native mode** database named `client-message-db` to store contact form submissions. The backend will write/read through Google server credentials and IAM. The contact form will not verify email or phone ownership.

## GCP Setup

- Use Firestore database ID: `client-message-db`.
- Use collection: `contact_messages`.
- Do not manually create the collection; Firestore creates it on first write.
- Backend service account has **Cloud Datastore User** role.
- Keep Firestore rules restrictive; browser will not access Firestore directly.
- Required backend env vars:
  - `FIRESTORE_DATABASE_ID=client-message-db`
  - `BACKEND_ADMIN_TOKEN=<existing-admin-token>`
- Local backend uses existing `GOOGLE_APPLICATION_CREDENTIALS`.
- Production backend must run with the authorized service account and the same env vars configured.

## Backend Plan

- Add Firestore client dependency.
- Add `MessageModule` with controller, service, and DTOs.
- `POST /api/message`
  - Body: `{ name, mobile, email, message }`
  - Saves one document to `contact_messages`.
  - Adds server-side `created_at`.
  - No OTP, no email verification, no phone verification.
  - Keep basic required-field and max-length validation.
- `GET /api/message`
  - Returns all messages ordered by newest first.
  - Protect with existing admin token pattern using `BACKEND_ADMIN_TOKEN`.
  - Use admin header `x-catalog-admin-token` for consistency with current backend/Postman admin routes.
- Register `MessageModule` in `AppModule`.
- Update Postman collection with create, fetch, and missing-token negative examples using existing `BACKEND_ADMIN_TOKEN` variable.

## UI Plan

- Remove fake OTP flow from `ContactForm`.
- Stop posting to FormSubmit.
- Submit form to `POST /api/message`.
- Show loading, success, and error states.
- Clear the form after successful save.
- Keep normal required-field UX, but do not verify email or phone ownership.

## Test Plan

- Backend unit tests for successful create and fetch.
- Backend validation tests for missing/extra fields.
- Backend admin auth test for `GET /api/message` without token.
- UI build/typecheck after wiring form submit.
- Manual Postman test against local backend.
