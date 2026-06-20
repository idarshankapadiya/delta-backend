import type { ExecutionContext } from '@nestjs/common';
import { CatalogAdminGuard } from './catalog-admin.guard';

describe('CatalogAdminGuard', () => {
  const originalToken = process.env.BACKEND_ADMIN_TOKEN;
  let guard: CatalogAdminGuard;

  beforeEach(() => {
    process.env.BACKEND_ADMIN_TOKEN = 'admin-token';
    guard = new CatalogAdminGuard();
  });

  afterAll(() => {
    process.env.BACKEND_ADMIN_TOKEN = originalToken;
  });

  it('allows matching x-backend-admin-token', () => {
    expect(guard.canActivate(createContext('admin-token'))).toBe(true);
  });

  it('rejects missing x-backend-admin-token', () => {
    expect(() => guard.canActivate(createContext())).toThrow(
      'Catalog admin token is required',
    );
  });

  function createContext(token?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            'x-backend-admin-token': token,
          },
        }),
      }),
    } as ExecutionContext;
  }
});
