import { Logger } from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { formatCatalogLabel, slugifyCatalogName } from './catalog-name.utils';

type MigrationMode = 'prepare' | 'cleanup';

interface MigrationOptions {
  apply: boolean;
  mode: MigrationMode;
}

interface CustomMetadata {
  [key: string]: string;
}

interface MetadataPatch {
  [key: string]: string | null;
}

const logger = new Logger('CatalogMetadataMigration');

function parseOptions(args: string[]): MigrationOptions {
  const modeArgument = args.find((argument) => argument.startsWith('--mode='));
  const mode = modeArgument?.slice('--mode='.length) ?? 'prepare';

  if (mode !== 'prepare' && mode !== 'cleanup') {
    throw new Error('Migration mode must be prepare or cleanup');
  }

  return {
    apply: args.includes('--apply'),
    mode,
  };
}

function getPrefix(): string {
  const prefix = (process.env.GCS_CATALOG_PREFIX ?? '')
    .trim()
    .replace(/^\/+/, '');

  if (!prefix) {
    return '';
  }

  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function isSupportedCatalogPdf(objectName: string, prefix: string): boolean {
  const relativeName = objectName.startsWith(prefix)
    ? objectName.slice(prefix.length)
    : objectName;
  const parts = relativeName.split('/').filter(Boolean);

  return (
    (parts.length === 2 || parts.length === 3) &&
    /\.pdf$/i.test(parts[parts.length - 1] ?? '')
  );
}

export function buildPreparedMetadata(
  metadata: CustomMetadata,
): CustomMetadata {
  const documentName = metadata.document_name ?? metadata.display_name;
  const companyName =
    metadata.company_name ??
    (metadata.company_slug
      ? formatCatalogLabel(metadata.company_slug)
      : undefined);

  if (!documentName || !companyName) {
    throw new Error(
      'document_name/display_name and company_slug/company_name are required',
    );
  }

  const documentSlug = slugifyCatalogName(documentName);
  const companySlug = metadata.company_slug;

  if (!documentSlug) {
    throw new Error('document_name must produce a non-empty slug');
  }

  if (!companySlug || slugifyCatalogName(companyName) !== companySlug) {
    throw new Error('company_name and company_slug must match');
  }

  return {
    ...metadata,
    company_name: companyName,
    document_name: documentName,
    document_slug: documentSlug,
  };
}

export function buildCleanedMetadata(metadata: CustomMetadata): MetadataPatch {
  if (!metadata.company_name || !metadata.document_name) {
    throw new Error(
      'prepare phase must complete before display_name can be removed',
    );
  }

  if (!Object.hasOwn(metadata, 'display_name')) {
    return metadata;
  }

  return {
    ...metadata,
    display_name: null,
  };
}

export function metadataChanged(
  current: MetadataPatch,
  next: MetadataPatch,
): boolean {
  return JSON.stringify(current) !== JSON.stringify(next);
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const bucketName = process.env.GCS_CATALOG_BUCKET?.trim();

  if (!bucketName) {
    throw new Error('GCS_CATALOG_BUCKET is required');
  }

  const storage = new Storage();
  const prefix = getPrefix();
  const [files] = await storage.bucket(bucketName).getFiles({
    prefix,
    autoPaginate: true,
  });
  const supportedFiles = files.filter((file) =>
    isSupportedCatalogPdf(file.name, prefix),
  );
  const candidates: Array<{
    file: (typeof files)[number];
    current: CustomMetadata;
    next: MetadataPatch;
  }> = [];
  const preflightFailures: string[] = [];

  for (const file of supportedFiles) {
    const current = {
      ...((file.metadata.metadata as CustomMetadata | undefined) ?? {}),
    };

    try {
      candidates.push({
        file,
        current,
        next:
          options.mode === 'prepare'
            ? buildPreparedMetadata(current)
            : buildCleanedMetadata(current),
      });
    } catch (error) {
      preflightFailures.push(
        `${file.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (options.mode === 'prepare') {
    const identities = new Map<string, string>();

    for (const candidate of candidates) {
      const identity = `${candidate.next.company_slug}/${candidate.next.document_slug}`;
      const existingObject = identities.get(identity);

      if (existingObject) {
        preflightFailures.push(
          `${candidate.file.name}: derived identity ${identity} conflicts with ${existingObject}`,
        );
      } else {
        identities.set(identity, candidate.file.name);
      }
    }
  }

  if (preflightFailures.length > 0) {
    preflightFailures.forEach((failure) => logger.error(failure));
    logger.error('Migration preflight failed; no objects were updated');
    process.exitCode = 1;
    return;
  }

  const changedCandidates = candidates.filter(({ current, next }) =>
    metadataChanged(current, next),
  );
  let failed = 0;

  for (const { file, next } of changedCandidates) {
    try {
      logger.log(`${options.apply ? 'Applying' : 'Would update'} ${file.name}`);

      if (options.apply) {
        await file.setMetadata({ metadata: next });
      }
    } catch (error) {
      failed += 1;
      logger.error(
        `Skipped ${file.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  logger.log(
    `mode=${options.mode} apply=${options.apply} scanned=${supportedFiles.length} changed=${changedCandidates.length} unchanged=${supportedFiles.length - changedCandidates.length} failed=${failed}`,
  );

  if (failed > 0) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void run().catch((error: unknown) => {
    logger.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
