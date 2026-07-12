import { NestFactory } from '@nestjs/core';
import multipart from '@fastify/multipart';
import cookie from '@fastify/cookie';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { getHttpHost, getHttpPort } from './config/http.config';
import { getCatalogUploadMaxBytes } from './config/catalog.config';
import { getCorsOrigins } from './config/origin.config';

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
  await app.register(cookie);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow: boolean) => void,
    ) => {
      if (!origin || getCorsOrigins().includes(origin)) {
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
