import { Injectable } from '@nestjs/common';

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
}

export interface ApiIndex {
  name: string;
  base_path: string;
  endpoints: ApiEndpoint[];
}

@Injectable()
export class AppService {
  getApiIndex(): ApiIndex {
    return {
      name: 'delta-backend',
      base_path: '/api',
      endpoints: [
        {
          method: 'GET',
          path: '/api',
          description: 'List available API endpoints.',
          auth: 'none',
        },
        {
          method: 'GET',
          path: '/api/health',
          description: 'Return backend health status.',
          auth: 'none',
        },
        {
          method: 'POST',
          path: '/api/message',
          description: 'Create a contact form message in Firestore.',
          auth: 'public-site origin, reCAPTCHA Enterprise, and rate limits',
        },
        {
          method: 'POST',
          path: '/api/business/auth/google',
          description:
            'Verify an allowlisted Google account and create a business session.',
          auth: 'Google ID token and approved business email',
        },
        {
          method: 'GET',
          path: '/api/business/auth/me',
          description: 'Return the current authenticated business user.',
          auth: '__Host-business_session HttpOnly cookie',
        },
        {
          method: 'POST',
          path: '/api/business/auth/logout',
          description: 'Revoke the current business session.',
          auth: 'business session and X-CSRF-Token',
        },
        {
          method: 'GET',
          path: '/api/business/messages',
          description: 'Return contact messages newest first.',
          auth: 'business session',
        },
        {
          method: 'GET',
          path: '/api/business/catalog/all',
          description: 'Return the catalog for dashboard administration.',
          auth: 'business session',
        },
        {
          method: 'POST/PUT/DELETE',
          path: '/api/business/catalog/**',
          description: 'Create, update, rename, or delete catalog content.',
          auth: 'business session and X-CSRF-Token',
        },
        {
          method: 'GET',
          path: '/api/catalog/all',
          description: 'Return full public catalog navigation and metadata.',
          auth: 'none',
        },
        {
          method: 'POST',
          path: '/api/catalog/library',
          description: 'Return selected company catalog library sections.',
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'POST',
          path: '/api/catalog/access',
          description: 'Record a catalog inquiry only; does not grant access.',
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'POST',
          path: '/api/catalog/access/google',
          description:
            'Verify a Google ID token and set the catalog_access cookie.',
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'POST',
          path: '/api/catalog/access/google/redirect',
          description:
            'Handle Google redirect sign-in, set the catalog_access cookie, and redirect home.',
          auth: 'Google Identity Services credential form post',
        },
        {
          method: 'GET',
          path: '/api/catalog/access/me',
          description:
            'Return the current catalog access session for a valid catalog_access cookie.',
          auth: 'catalog_access HttpOnly cookie',
        },
        {
          method: 'POST',
          path: '/api/catalog/access/request-otp',
          description:
            'Create an OTP challenge and deliver a one-time verification code.',
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'POST',
          path: '/api/catalog/access/verify-otp',
          description: 'Verify an OTP challenge and set catalog_access.',
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'POST',
          path: '/api/catalog/access/logout',
          description: 'Revoke the current catalog access session.',
          auth: 'catalog_access HttpOnly cookie',
        },
        {
          method: 'POST',
          path: '/api/catalog/documents/access',
          description:
            'Create a short-lived signed PDF URL for preview or download.',
          auth: 'catalog_access HttpOnly cookie and allowed browser origin',
        },
      ],
    };
  }
}
