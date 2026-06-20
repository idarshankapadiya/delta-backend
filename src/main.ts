import { NestFactory } from '@nestjs/core';
import multipart from '@fastify/multipart';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  getAllowedFrontendOrigins,
  getHttpHost,
  getHttpPort,
} from './config/http.config';
import { getCatalogUploadMaxBytes } from './config/catalog.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(multipart, {
    limits: {
      files: 1,
      fileSize: getCatalogUploadMaxBytes(),
    },
  });

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow: boolean) => void,
    ) => {
      if (!origin || getAllowedFrontendOrigins().includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');
  const port = getHttpPort();
  const host = getHttpHost();
  await app.listen(port, host);
  logger.log(`Backend listening on http://${host}:${port}/api`);

  if (host === '0.0.0.0') {
    logger.log(`Local backend URL: http://localhost:${port}/api`);
  }
}
void bootstrap();
