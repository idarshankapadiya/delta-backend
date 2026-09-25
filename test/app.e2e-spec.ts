import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import type { ApiIndex } from './../src/app.service';
import { setupSwagger } from './../src/openapi';

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
    setupSwagger(app);
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
              path: '/api/catalog/access/otp/request',
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
              method: 'POST',
              path: '/api/quotation-requests',
            }),
            expect.objectContaining({
              method: 'POST/PUT/DELETE',
              path: '/api/business/catalog/**',
            }),
          ]),
        );
      });
  });

  it('serves Swagger UI and raw OpenAPI definitions', async () => {
    await request(app.getHttpServer())
      .get('/api/docs')
      .expect(200)
      .expect('Content-Type', /text\/html/);

    const jsonResponse = await request(app.getHttpServer())
      .get('/api/docs/openapi.json')
      .expect(200)
      .expect('Content-Type', /application\/json/);
    const document = jsonResponse.body as OpenAPIObject;
    expect(document.openapi).toBe('3.0.0');
    expect(Object.keys(document.paths)).toHaveLength(51);
    const specificationPath =
      document.paths['/api/business/products/{productId}/specifications/{key}'];
    expect(specificationPath?.put).toBeDefined();
    expect(specificationPath?.delete).toBeDefined();
    const mainImagePath =
      document.paths['/api/business/products/{productId}/main-image'];
    expect(mainImagePath?.put).toBeDefined();
    expect(mainImagePath?.delete).toBeDefined();
    const additionalImagesPath =
      document.paths['/api/business/products/{productId}/additional-images'];
    expect(additionalImagesPath?.post).toBeDefined();
    const additionalImagePath =
      document.paths[
        '/api/business/products/{productId}/additional-images/{index}'
      ];
    expect(additionalImagePath?.put).toBeDefined();
    expect(additionalImagePath?.delete).toBeDefined();

    await request(app.getHttpServer())
      .get('/api/docs/openapi.yaml')
      .expect(200)
      .expect('Content-Type', /text\/yaml/)
      .expect(/openapi: 3\.0\.0/);
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
      ['POST', '/api/products/cart-validation'],
      ['POST', '/api/quotation-requests'],
      ['POST', '/api/message'],
      ['GET', '/api/catalog/all'],
      ['POST', '/api/catalog/library'],
      ['POST', '/api/catalog/access'],
      ['POST', '/api/catalog/access/google'],
      ['POST', '/api/catalog/access/google/redirect'],
      ['POST', '/api/catalog/access/firebase/email-link'],
      ['GET', '/api/catalog/access/me'],
      ['POST', '/api/catalog/access/otp/request'],
      ['POST', '/api/catalog/access/otp/verify'],
      ['POST', '/api/catalog/access/otp/resend'],
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
      ['POST', '/api/business/products/upload'],
      ['PUT', '/api/business/products/:productId'],
      ['PUT', '/api/business/products/:productId/specifications/:key'],
      ['DELETE', '/api/business/products/:productId/specifications/:key'],
      ['PUT', '/api/business/products/:productId/upload'],
      ['PUT', '/api/business/products/:productId/main-image'],
      ['DELETE', '/api/business/products/:productId/main-image'],
      ['POST', '/api/business/products/:productId/additional-images'],
      ['PUT', '/api/business/products/:productId/additional-images/:index'],
      ['DELETE', '/api/business/products/:productId/additional-images/:index'],
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
      ['GET', '/api/business/quotation-requests'],
      ['GET', '/api/business/quotation-requests/:quotationId'],
      ['PATCH', '/api/business/quotation-requests/:quotationId/status'],
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
