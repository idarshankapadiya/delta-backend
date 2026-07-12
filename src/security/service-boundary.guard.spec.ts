import type { ExecutionContext } from '@nestjs/common';
import { ServiceBoundaryGuard } from './service-boundary.guard';

describe('ServiceBoundaryGuard', () => {
  const originalValue = process.env.INTERNAL_ADMIN_SERVICE_ONLY;
  const guard = new ServiceBoundaryGuard();

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env.INTERNAL_ADMIN_SERVICE_ONLY;
    } else {
      process.env.INTERNAL_ADMIN_SERVICE_ONLY = originalValue;
    }
  });

  it('does not restrict the public service', () => {
    delete process.env.INTERNAL_ADMIN_SERVICE_ONLY;
    expect(guard.canActivate(contextFor('/api/business/messages'))).toBe(true);
  });

  it('exposes only health and internal routes on the admin service', () => {
    process.env.INTERNAL_ADMIN_SERVICE_ONLY = 'true';

    expect(guard.canActivate(contextFor('/api/health'))).toBe(true);
    expect(
      guard.canActivate(contextFor('/api/internal/catalog/documents')),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextFor('/api/business/messages')),
    ).toThrow('Not found');
    expect(() => guard.canActivate(contextFor('/api/message'))).toThrow(
      'Not found',
    );
  });
});

function contextFor(url: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ url }),
    }),
  } as unknown as ExecutionContext;
}
