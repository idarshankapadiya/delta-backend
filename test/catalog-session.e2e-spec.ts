import cookie from '@fastify/cookie';
import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { CatalogController } from '../src/catalog/catalog.controller';
import { CatalogAccessService } from '../src/catalog/catalog-access.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { CatalogRateLimiterService } from '../src/catalog/catalog-rate-limiter.service';
import { RecaptchaEnterpriseService } from '../src/message/recaptcha-enterprise.service';
import { MessageRateLimiterService } from '../src/message/message-rate-limiter.service';
import { getPublicSiteOrigins } from '../src/config/origin.config';

describe('Catalog session restoration (HTTP)', () => {
  let app: NestFastifyApplication;
  const session = {
    customerId: 'customer-refresh-test',
    authProvider: 'google',
    email: 'customer@example.com',
    name: 'Customer',
    expiresAt: new Date('2099-01-01T00:00:00.000Z'),
  };
  const accessService = {
    createGoogleAccess: jest.fn().mockResolvedValue({
      ...session,
      token: 'valid-session',
    }),
    getAccessSession: jest.fn((token: string) =>
      Promise.resolve(token === 'valid-session' ? session : null),
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CatalogController],
      providers: [
        { provide: CatalogAccessService, useValue: accessService },
        { provide: CatalogService, useValue: {} },
        {
          provide: CatalogRateLimiterService,
          useValue: { assertAllowed: jest.fn() },
        },
        { provide: RecaptchaEnterpriseService, useValue: {} },
        { provide: MessageRateLimiterService, useValue: {} },
      ],
    }).compile();
    app = module.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.register(cookie);
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('restores a login cookie repeatedly without creating or extending a session', async () => {
    const origin = getPublicSiteOrigins()[0];
    const login = await app.inject({
      method: 'POST',
      url: '/api/catalog/access/google',
      headers: { origin },
      payload: { id_token: 'test-google-token' },
    });
    expect(login.statusCode).toBe(201);
    const loginCookie = String(login.headers['set-cookie']).split(';')[0];
    expect(loginCookie).toBe('catalog_access=valid-session');

    for (let refresh = 0; refresh < 2; refresh += 1) {
      const restored = await app.inject({
        method: 'POST',
        url: '/api/catalog/access/me',
        headers: { origin, cookie: loginCookie },
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json()).toMatchObject({
        ok: true,
        customer_id: session.customerId,
        email: session.email,
        expires_at: session.expiresAt.toISOString(),
      });
      expect(restored.headers['cache-control']).toBe('no-store');
      expect(restored.headers['set-cookie']).toBeUndefined();
    }
    expect(accessService.createGoogleAccess).toHaveBeenCalledTimes(1);
  });

  it.each(['', 'catalog_access=expired-or-invalid'])(
    'rejects missing or invalid cookies: %s',
    async (sessionCookie) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/catalog/access/me',
        headers: { origin: getPublicSiteOrigins()[0], cookie: sessionCookie },
      });
      expect(response.statusCode).toBe(401);
    },
  );

  it.each([undefined, 'https://untrusted.example'])(
    'preserves rejection of missing or untrusted Origin: %s',
    async (origin) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/catalog/access/me',
        headers: {
          ...(origin ? { origin } : {}),
          cookie: 'catalog_access=valid-session',
        },
      });
      expect(response.statusCode).toBe(403);
    },
  );

  it('keeps the original GET endpoint available to clients sending Origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/catalog/access/me',
      headers: {
        origin: getPublicSiteOrigins()[0],
        cookie: 'catalog_access=valid-session',
      },
    });
    expect(response.statusCode).toBe(200);
  });
});
