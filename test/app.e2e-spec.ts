import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import type { ApiIndex } from './../src/app.service';

describe('AppController (e2e)', () => {
  let app: NestFastifyApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect((response) => {
        const body = response.body as ApiIndex;
        expect(body.base_path).toBe('/api');
        expect(body.endpoints).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              method: 'GET',
              path: '/api',
            }),
            expect.objectContaining({
              method: 'GET',
              path: '/api/products',
            }),
            expect.objectContaining({
              method: 'POST',
              path: '/api/catalog/access/request-otp',
            }),
            expect.objectContaining({
              method: 'GET',
              path: '/api/business/messages',
            }),
            expect.objectContaining({
              method: 'DELETE',
              path: '/api/business/messages/:message_id',
            }),
            expect.objectContaining({
              method: 'POST/PUT/DELETE',
              path: '/api/business/catalog/**',
            }),
          ]),
        );
      });
  });

  it('registers every preserved public, business, and internal endpoint path', () => {
    const server = app.getHttpAdapter().getInstance();
    const expectedRoutes = [
      ['GET', '/api'],
      ['GET', '/api/health'],
      ['GET', '/api/companies'],
      ['GET', '/api/categories'],
      ['GET', '/api/products'],
      ['GET', '/api/products/:productId'],
      ['POST', '/api/message'],
      ['GET', '/api/catalog/all'],
      ['POST', '/api/catalog/library'],
      ['POST', '/api/catalog/access'],
      ['POST', '/api/catalog/access/google'],
      ['POST', '/api/catalog/access/google/redirect'],
      ['GET', '/api/catalog/access/me'],
      ['POST', '/api/catalog/access/request-otp'],
      ['POST', '/api/catalog/access/verify-otp'],
      ['POST', '/api/catalog/documents/access'],
      ['POST', '/api/catalog/access/logout'],
      ['POST', '/api/business/auth/google'],
      ['GET', '/api/business/auth/me'],
      ['POST', '/api/business/auth/logout'],
      ['POST', '/api/business/companies'],
      ['PUT', '/api/business/companies/:companyId'],
      ['DELETE', '/api/business/companies/:companyId'],
      ['POST', '/api/business/categories'],
      ['PUT', '/api/business/categories/:categoryId'],
      ['DELETE', '/api/business/categories/:categoryId'],
      ['POST', '/api/business/products'],
      ['PUT', '/api/business/products/:productId'],
      ['DELETE', '/api/business/products/out-of-stock/:productId'],
      ['DELETE', '/api/business/products/:productId'],
      ['GET', '/api/business/catalog/all'],
      ['POST', '/api/business/catalog/documents'],
      ['POST', '/api/business/catalog/documents/access'],
      ['PUT', '/api/business/catalog/documents/:document_id'],
      ['PUT', '/api/business/catalog/companies/:company_slug'],
      ['DELETE', '/api/business/catalog/documents/:document_id'],
      ['GET', '/api/business/messages'],
      ['DELETE', '/api/business/messages/:message_id'],
      ['GET', '/api/internal/messages'],
      ['POST', '/api/internal/catalog/documents'],
      ['PUT', '/api/internal/catalog/documents/:document_id'],
      ['PUT', '/api/internal/catalog/companies/:company_slug'],
      ['DELETE', '/api/internal/catalog/documents/:document_id'],
    ] as const;

    for (const [method, url] of expectedRoutes) {
      expect(server.hasRoute({ method, url })).toBe(true);
    }
  });
});
