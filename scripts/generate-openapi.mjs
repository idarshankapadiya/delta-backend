import 'reflect-metadata';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { stringify } from 'yaml';
import { AppModule } from '../dist/app.module.js';
import { createOpenApiDocument } from '../dist/openapi.js';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const outputPath = resolve(
  repositoryRoot,
  'openapi/delta-backend.openapi.yaml',
);

const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'),
);
const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
  logger: false,
});

try {
  app.setGlobalPrefix('api');
  const document = createOpenApiDocument(app);
  document.info.version = packageJson.version;
  const output = stringify(JSON.parse(JSON.stringify(document)));
  if (process.argv.includes('--check')) {
    const current = await readFile(outputPath, 'utf8');
    if (current !== output) {
      throw new Error(
        'OpenAPI YAML is stale. Run npm run openapi:generate and commit the result.',
      );
    }
    console.log(`OpenAPI YAML is current: ${outputPath}`);
  } else {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, output, 'utf8');
    console.log(`Generated ${outputPath}`);
  }
} finally {
  await app.close();
}
