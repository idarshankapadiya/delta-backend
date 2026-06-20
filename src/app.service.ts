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
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'GET',
          path: '/api/message',
          description: 'Return contact form messages newest first.',
          auth: 'x-backend-admin-token',
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
            'Create an OTP challenge or grant temporary master OTP access.',
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
          path: '/api/catalog/documents/access',
          description:
            'Create a short-lived signed PDF URL for preview or download.',
          auth: 'allowed browser origin for browser requests',
        },
        {
          method: 'POST',
          path: '/api/catalog/documents',
          description: 'Create a catalog document PDF and thumbnail.',
          auth: 'x-backend-admin-token',
        },
        {
          method: 'PUT',
          path: '/api/catalog/documents/:document_id',
          description:
            'Update catalog document metadata or replace the current PDF.',
          auth: 'x-backend-admin-token',
        },
        {
          method: 'DELETE',
          path: '/api/catalog/documents/:document_id',
          description: 'Delete a catalog document and public thumbnail.',
          auth: 'x-backend-admin-token',
        },
      ],
    };
  }
}
