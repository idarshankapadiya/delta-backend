import { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CatalogOriginGuard } from './catalog-origin.guard';

describe('CatalogOriginGuard', () => {
  const originalFrontendOrigin = process.env.FRONTEND_ORIGIN;
  let guard: CatalogOriginGuard;

  beforeEach(() => {
    process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
    guard = new CatalogOriginGuard();
  });

  afterAll(() => {
    process.env.FRONTEND_ORIGIN = originalFrontendOrigin;
  });

  it('allows requests without an origin header for Postman and curl', () => {
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows the configured frontend origin', () => {
    expect(guard.canActivate(createContext('http://localhost:5173'))).toBe(
      true,
    );
  });

  it('rejects unexpected browser origins', () => {
    expect(() =>
      guard.canActivate(createContext('https://example.com')),
    ).toThrow('Origin is not allowed');
  });

  it('supports comma-separated frontend origins', () => {
    process.env.FRONTEND_ORIGIN =
      'http://localhost:5173,https://catalog.example.com';

    expect(
      guard.canActivate(createContext('https://catalog.example.com')),
    ).toBe(true);
  });

  function createContext(origin?: string): ExecutionContext {
    const request = {
      headers: {
        origin,
      },
    } as FastifyRequest;

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }
});
