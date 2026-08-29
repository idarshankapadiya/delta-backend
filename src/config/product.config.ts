import { ServiceUnavailableException } from '@nestjs/common';

export type ProductAssetDelivery = 'public' | 'signed';

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
