import { NestFactory } from '@nestjs/core';
import multipart from '@fastify/multipart';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  getAllowedFrontendOrigins,
  getHttpHost,
  getHttpPort,
} from './config/http.config';
import { getCatalogUploadMaxBytes } from './config/catalog.config';

async function bootstrap() {
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
  await app.listen(getHttpPort(), getHttpHost());
}
void bootstrap();
