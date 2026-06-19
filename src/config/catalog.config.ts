const DEFAULT_CATALOG_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;

export function getCatalogUploadMaxBytes(): number {
  const value = Number(
    process.env.CATALOG_UPLOAD_MAX_BYTES ?? DEFAULT_CATALOG_UPLOAD_MAX_BYTES,
  );

  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_CATALOG_UPLOAD_MAX_BYTES;
  }

  return Math.floor(value);
}
