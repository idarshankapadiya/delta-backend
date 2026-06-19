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
            method: 'POST',
            path: '/api/catalog/documents/access',
          }),
          expect.objectContaining({
            method: 'DELETE',
            path: '/api/catalog/documents/:document_id',
          }),
        ]),
      );
    });
  });
});
