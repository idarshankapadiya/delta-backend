import type { ExecutionContext } from '@nestjs/common';
import {
  BusinessSiteOriginGuard,
  PublicSiteOriginGuard,
} from './origin.guards';

describe('route-specific origin guards', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeAll(() => {
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('permits only the public site on public routes', () => {
    const guard = new PublicSiteOriginGuard();

    expect(
      guard.canActivate(contextWithOrigin('https://darshanent.co.in')),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextWithOrigin('https://business.darshanent.co.in')),
    ).toThrow('Public UI origin is required');
    expect(() => guard.canActivate(contextWithOrigin())).toThrow(
      'Public UI origin is required',
    );
  });

  it('permits only the business site on business routes', () => {
    const guard = new BusinessSiteOriginGuard();

    expect(
      guard.canActivate(contextWithOrigin('https://business.darshanent.co.in')),
    ).toBe(true);
    expect(() =>
      guard.canActivate(contextWithOrigin('https://darshanent.co.in')),
    ).toThrow('Business UI origin is required');
  });
});

function contextWithOrigin(origin?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { origin },
      }),
    }),
  } as unknown as ExecutionContext;
}
