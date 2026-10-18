import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const generatedFolderName = 'OpenAPI Generated Coverage';
const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const openApiPath = resolve(
  repositoryRoot,
  'openapi/delta-backend.openapi.yaml',
);
const postmanPath = resolve(
  repositoryRoot,
  'postman/delta-backend-catalog-gcs.postman_collection.json',
);

const document = parse(await readFile(openApiPath, 'utf8'));
const originalPostman = await readFile(postmanPath, 'utf8');
const collection = JSON.parse(originalPostman);
const manualItems = (collection.item || []).filter(
  (item) => item.name !== generatedFolderName,
);

function requestUrl(request) {
  if (typeof request.url === 'string') return request.url;
  return request.url?.raw || '';
}

function normalizedPath(value) {
  const apiIndex = value.indexOf('/api');
  if (apiIndex < 0) return undefined;
  return value
    .slice(apiIndex)
    .split(/[?#]/, 1)[0]
    .split('/')
    .map((segment) =>
      /^\{(?:\{.+\}|.+)\}$/.test(segment) || /^:.+/.test(segment)
        ? '{}'
        : segment,
    )
    .join('/');
}

function collectRequestKeys(items, keys = new Set()) {
  for (const item of items || []) {
    if (item.request?.method) {
      const path = normalizedPath(requestUrl(item.request));
      if (path) keys.add(`${item.request.method.toUpperCase()} ${path}`);
    }
    collectRequestKeys(item.item, keys);
  }
  return keys;
}

function operationKey(method, path) {
  return `${method.toUpperCase()} ${normalizedPath(path)}`;
}

function resolveSchema(schema) {
  if (!schema?.$ref) return schema || {};
  const name = schema.$ref.split('/').at(-1);
  return document.components?.schemas?.[name] || {};
}

function schemaExample(schema, fieldName = 'value', depth = 0) {
  const resolved = resolveSchema(schema);
  if (resolved.example !== undefined) return resolved.example;
  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum?.length) return resolved.enum[0];
  if (depth > 5) return null;

  if (resolved.type === 'object' || resolved.properties) {
    return Object.fromEntries(
      Object.entries(resolved.properties || {}).map(([name, property]) => [
        name,
        schemaExample(property, name, depth + 1),
      ]),
    );
  }
  if (resolved.type === 'array') return [];
  if (resolved.type === 'boolean') return false;
  if (resolved.type === 'integer' || resolved.type === 'number') return 0;
  if (resolved.format === 'email') return 'user@example.com';
  return `<${fieldName}>`;
}

function requestHeaders(path, operation, mediaType) {
  const headers = [];
  if (!path.startsWith('/api/internal/')) {
    if (
      path.startsWith('/api/business/') ||
      path === '/api/message' ||
      (path.startsWith('/api/catalog/') && path !== '/api/catalog/all')
    ) {
      headers.push({ key: 'Origin', value: '{{frontend_origin}}' });
    }
  }
  if (mediaType === 'application/json') {
    headers.push({ key: 'Content-Type', value: 'application/json' });
  }
  const securityNames = new Set(
    (operation.security || []).flatMap((requirement) =>
      Object.keys(requirement),
    ),
  );
  if (securityNames.has('csrfToken')) {
    headers.push({ key: 'X-CSRF-Token', value: '{{business_csrf_token}}' });
  }
  if (securityNames.has('internalAdmin')) {
    headers.push({
      key: 'X-Backend-Admin-Token',
      value: '{{BACKEND_ADMIN_TOKEN}}',
    });
  }
  return headers;
}

function requestBody(operation) {
  const content = operation.requestBody?.content || {};
  if (content['application/json']) {
    return {
      mediaType: 'application/json',
      body: {
        mode: 'raw',
        raw: JSON.stringify(
          schemaExample(content['application/json'].schema),
          null,
          2,
        ),
        options: { raw: { language: 'json' } },
      },
    };
  }
  if (content['multipart/form-data']) {
    const schema = resolveSchema(content['multipart/form-data'].schema);
    const required = new Set(schema.required || []);
    return {
      mediaType: 'multipart/form-data',
      body: {
        mode: 'formdata',
        formdata: Object.entries(schema.properties || {}).map(
          ([key, property]) =>
            property.format === 'binary'
              ? {
                  key,
                  type: 'file',
                  src: [],
                  ...(required.has(key) ? {} : { disabled: true }),
                }
              : {
                  key,
                  value: String(schemaExample(property, key)),
                  type: 'text',
                  ...(required.has(key) ? {} : { disabled: true }),
                },
        ),
      },
    };
  }
  return {};
}

function postmanUrl(path) {
  const base = path.startsWith('/api/internal/')
    ? '{{admin_base_url}}'
    : '{{base_url}}';
  return base + path.replace(/\{([^}]+)\}/g, (_match, name) => `{{${name}}}`);
}

function generatedRequest(method, path, operation) {
  const { body, mediaType } = requestBody(operation);
  const request = {
    method: method.toUpperCase(),
    header: requestHeaders(path, operation, mediaType),
    url: postmanUrl(path),
    description: `Generated from OpenAPI operation ${operation.operationId}. Add workflow-specific examples and tests here or move the request into a maintained feature folder.`,
  };
  if (body) request.body = body;
  return {
    name: operation.summary || operation.operationId,
    request,
  };
}

const manualRequestKeys = collectRequestKeys(manualItems);
const missingByTag = new Map();
const openApiKeys = new Set();

for (const [path, pathItem] of Object.entries(document.paths || {})) {
  for (const method of httpMethods) {
    const operation = pathItem[method];
    if (!operation) continue;
    const key = operationKey(method, path);
    openApiKeys.add(key);
    if (manualRequestKeys.has(key)) continue;
    const tag = operation.tags?.[0] || 'Other';
    const requests = missingByTag.get(tag) || [];
    requests.push(generatedRequest(method, path, operation));
    missingByTag.set(tag, requests);
  }
}

const generatedItems = [...missingByTag.entries()]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, item]) => ({ name, item }));
const generatedFolder = {
  name: generatedFolderName,
  description:
    'Requests generated only for OpenAPI operations that are not represented in the hand-maintained folders. Run npm run api:artifacts after route changes.',
  item: generatedItems,
};
collection.item = generatedItems.length
  ? [...manualItems, generatedFolder]
  : manualItems;

const allRequestKeys = collectRequestKeys(collection.item);
const uncovered = [...openApiKeys].filter((key) => !allRequestKeys.has(key));
if (uncovered.length) {
  throw new Error(`Postman coverage is incomplete:\n${uncovered.join('\n')}`);
}

const output = `${JSON.stringify(collection, null, 2)}\n`;
if (process.argv.includes('--check')) {
  if (output !== originalPostman) {
    throw new Error(
      'Postman collection is stale. Run npm run postman:sync and commit the result.',
    );
  }
} else {
  await writeFile(postmanPath, output, 'utf8');
}

const generatedCount = [...missingByTag.values()].reduce(
  (total, requests) => total + requests.length,
  0,
);
console.log(
  `Postman covers ${openApiKeys.size} OpenAPI operations (${generatedCount} generated coverage requests).`,
);
