import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the available API endpoints', () => {
      const response = appController.getApiIndex();

      expect(response.base_path).toBe('/api');
      expect(response.endpoints).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            method: 'GET',
            path: '/api/health',
          }),
          expect.objectContaining({
            method: 'GET',
            path: '/api/products',
          }),
          expect.objectContaining({
            method: 'GET',
            path: '/api/products/:productId',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/message',
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
            method: 'GET',
            path: '/api/business/catalog/all',
          }),
          expect.objectContaining({
            method: 'POST/PUT/DELETE',
            path: '/api/business/catalog/**',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/business/products',
          }),
          expect.objectContaining({
            method: 'PUT/DELETE',
            path: '/api/business/products/:productId',
          }),
          expect.objectContaining({
            method: 'DELETE',
            path: '/api/business/products/out-of-stock/:productId',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/business/companies',
          }),
          expect.objectContaining({
            method: 'PUT/DELETE',
            path: '/api/business/companies/:companyId',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/business/categories',
          }),
          expect.objectContaining({
            method: 'PUT/DELETE',
            path: '/api/business/categories/:categoryId',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/catalog/documents/access',
          }),
          expect.objectContaining({
            method: 'GET',
            path: '/api/catalog/access/me',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/catalog/access/logout',
          }),
          expect.objectContaining({
            method: 'POST',
            path: '/api/catalog/access/google/redirect',
          }),
        ]),
      );
    });
  });
});
