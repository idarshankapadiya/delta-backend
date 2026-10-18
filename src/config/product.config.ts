import { ServiceUnavailableException } from '@nestjs/common';

export type ProductAssetDelivery = 'public' | 'signed';

const DEFAULT_PRODUCT_IMAGE_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_PRODUCT_BROCHURE_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
const DEFAULT_PRODUCT_UPLOAD_TOTAL_MAX_BYTES = 200 * 1024 * 1024;
const DEFAULT_PRODUCT_THUMBNAIL_WIDTH = 480;
const DEFAULT_PRODUCT_THUMBNAIL_QUALITY = 80;

export function getProductFirestoreDatabaseId(): string {
  const databaseId = (
    process.env.PRODUCT_FIRESTORE_DATABASE_ID ??
    process.env.FIRESTORE_DATABASE_ID
  )?.trim();

  if (!databaseId) {
    throw new ServiceUnavailableException(
      'PRODUCT_FIRESTORE_DATABASE_ID or FIRESTORE_DATABASE_ID is required',
    );
  }

  return databaseId;
}

export function getProductBucketName(): string {
  const bucket = process.env.GCS_PRODUCT_BUCKET?.trim();

  if (!bucket) {
    throw new ServiceUnavailableException('GCS_PRODUCT_BUCKET is required');
  }

  return bucket;
}

export function getProductThumbnailBucketName(): string {
  const bucket = (
    process.env.GCS_PRODUCT_THUMBNAIL_BUCKET ??
    process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET
  )?.trim();

  if (!bucket) {
    throw new ServiceUnavailableException(
      'GCS_PRODUCT_THUMBNAIL_BUCKET or GCS_CATALOG_PUBLIC_ASSET_BUCKET is required',
    );
  }

  return bucket;
}

export function getProductImageUploadMaxBytes(): number {
  return positiveIntegerEnvironmentValue(
    'PRODUCT_IMAGE_UPLOAD_MAX_BYTES',
    DEFAULT_PRODUCT_IMAGE_UPLOAD_MAX_BYTES,
  );
}

export function getProductBrochureUploadMaxBytes(): number {
  return positiveIntegerEnvironmentValue(
    'PRODUCT_BROCHURE_UPLOAD_MAX_BYTES',
    DEFAULT_PRODUCT_BROCHURE_UPLOAD_MAX_BYTES,
  );
}

export function getProductUploadTotalMaxBytes(): number {
  return positiveIntegerEnvironmentValue(
    'PRODUCT_UPLOAD_TOTAL_MAX_BYTES',
    DEFAULT_PRODUCT_UPLOAD_TOTAL_MAX_BYTES,
  );
}

export function getProductMultipartFileMaxBytes(): number {
  return Math.max(
    getProductImageUploadMaxBytes(),
    getProductBrochureUploadMaxBytes(),
  );
}

export function getProductThumbnailWidth(): number {
  return positiveIntegerEnvironmentValue(
    'PRODUCT_THUMBNAIL_WIDTH',
    DEFAULT_PRODUCT_THUMBNAIL_WIDTH,
  );
}

export function getProductThumbnailQuality(): number {
  return Math.min(
    positiveIntegerEnvironmentValue(
      'PRODUCT_THUMBNAIL_QUALITY',
      DEFAULT_PRODUCT_THUMBNAIL_QUALITY,
    ),
    100,
  );
}

export function getProductAssetDelivery(): ProductAssetDelivery {
  return process.env.PRODUCT_ASSET_DELIVERY?.trim().toLowerCase() === 'public'
    ? 'public'
    : 'signed';
}

export function getProductPublicAssetBaseUrl(bucket: string): string {
  const configured = process.env.PRODUCT_PUBLIC_ASSET_BASE_URL?.trim();

  return (configured || `https://storage.googleapis.com/${bucket}`).replace(
    /\/+$/,
    '',
  );
}

export function getProductSignedUrlTtlSeconds(): number {
  const configured = Number(process.env.PRODUCT_SIGNED_URL_TTL_SECONDS ?? 3600);

  if (!Number.isFinite(configured) || configured < 300 || configured > 86400) {
    return 3600;
  }

  return Math.floor(configured);
}

function positiveIntegerEnvironmentValue(
  name: string,
  fallback: number,
): number {
  const configured = Number(process.env[name] ?? fallback);
  return Number.isFinite(configured) && configured > 0
    ? Math.floor(configured)
    : fallback;
}
