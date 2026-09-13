import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';

export const swaggerUiPath = 'docs';
export const swaggerJsonPath = 'docs/openapi.json';
export const swaggerYamlPath = 'docs/openapi.yaml';

function createOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('Delta Backend API')
    .setDescription(
      'Public catalog and product APIs, catalog access flows, authenticated business administration, and internal administration endpoints.',
    )
    .setVersion('1.0.0')
    .addTag('System', 'API discovery and health endpoints.')
    .addTag('Products', 'Public product discovery endpoints.')
    .addTag('Catalog', 'Public catalog and access endpoints.')
    .addTag('Contact Messages', 'Public contact form submission.')
    .addTag(
      'Business Authentication',
      'Business dashboard authentication and session endpoints.',
    )
    .addTag('Business Products', 'Authenticated product administration.')
    .addTag('Business Catalog', 'Authenticated catalog administration.')
    .addTag('Business Messages', 'Authenticated contact message management.')
    .addTag('Internal Catalog', 'Service-to-service catalog administration.')
    .addTag('Internal Messages', 'Service-to-service message access.')
    .addCookieAuth(
      'business_session',
      {
        type: 'apiKey',
        in: 'cookie',
        description:
          'Business session cookie. Production uses __Host-business_session.',
      },
      'businessSession',
    )
    .addCookieAuth(
      'catalog_access',
      {
        type: 'apiKey',
        in: 'cookie',
        description: 'Catalog access session cookie.',
      },
      'catalogAccess',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-CSRF-Token',
        description: 'CSRF token returned by business authentication.',
      },
      'csrfToken',
    )
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: 'X-Backend-Admin-Token',
        description: 'Token for the optional internal administration API.',
      },
      'internalAdmin',
    )
    .build();
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, createOpenApiConfig(), {
    deepScanRoutes: true,
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey.replace(/Controller$/, '')}_${methodKey}`,
  });
}

export function setupSwagger(app: INestApplication): void {
  SwaggerModule.setup(swaggerUiPath, app, () => createOpenApiDocument(app), {
    useGlobalPrefix: true,
    jsonDocumentUrl: swaggerJsonPath,
    yamlDocumentUrl: swaggerYamlPath,
    customSiteTitle: 'Delta Backend API Docs',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: true,
    },
  });
}
