import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import type { ApiIndex } from './../src/app.service';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
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
              method: 'POST',
              path: '/api/catalog/access/request-otp',
            }),
            expect.objectContaining({
              method: 'GET',
              path: '/api/business/messages',
            }),
            expect.objectContaining({
              method: 'POST/PUT/DELETE',
              path: '/api/business/catalog/**',
            }),
          ]),
        );
      });
  });
});
