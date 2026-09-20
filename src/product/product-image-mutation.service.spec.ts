import { ProductMutationService } from './product-mutation.service';

describe('ProductMutationService image mutations', () => {
  const bucket = 'product-images';
  const thumbnailBucket = 'product-thumbnails';

  beforeEach(() => {
    process.env.GCS_PRODUCT_BUCKET = bucket;
    process.env.GCS_PRODUCT_THUMBNAIL_BUCKET = thumbnailBucket;
  });

  afterEach(() => {
    delete process.env.GCS_PRODUCT_BUCKET;
    delete process.env.GCS_PRODUCT_THUMBNAIL_BUCKET;
  });

  it('replaces one additional image and removes only its previous object', async () => {
    const first = { bucket, path: 'products/acme/widget/first.png' };
    const second = { bucket, path: 'products/acme/widget/second.png' };
    const { service, record, deleted } = imageService({
      companyId: 'acme',
      additionalImages: [first, second],
    });

    await service.replaceProductImage(
      'widget',
      'additional',
      {
        additionalImages: [imageFile()],
      },
      1,
    );

    expect((record.additionalImages as unknown[])[0]).toEqual(first);
    const replacement = (
      record.additionalImages as { bucket: string; path: string }[]
    )[1];
    expect(replacement.bucket).toBe(bucket);
    expect(replacement.path).toContain('additional-1-');
    expect(deleted).toEqual([`${bucket}/${second.path}`]);
  });

  it('deletes the main image and its generated thumbnail together', async () => {
    const main = { bucket, path: 'products/acme/widget/main.png' };
    const thumbnail = {
      bucket: thumbnailBucket,
      path: 'product-thumbnails/v1/acme/widget/thumbnail.webp',
    };
    const { service, deleted, updates } = imageService({
      companyId: 'acme',
      mainImage: main,
      thumbnail,
    });

    const result = await service.deleteProductImage('widget', 'main');

    expect(result.deletedAssets).toBe(2);
    expect(Object.keys(updates[0])).toContain('mainImage');
    expect(Object.keys(updates[0])).toContain('thumbnail');
    expect(Object.keys(updates[0])).toContain('thumbnailPath');
    expect(deleted.sort()).toEqual(
      [`${bucket}/${main.path}`, `${thumbnailBucket}/${thumbnail.path}`].sort(),
    );
  });

  it('clears legacy image fields and removes their stored thumbnail', async () => {
    const { service, deleted, updates } = imageService({
      companyId: 'acme',
      mainImagePath: 'products/acme/widget/main.png',
      thumbnailPath: 'product-thumbnails/v1/acme/widget/thumbnail.webp',
    });

    const result = await service.deleteProductImage('widget', 'main');

    expect(result.deletedAssets).toBe(2);
    expect(updates[0]).toHaveProperty('mainImagePath');
    expect(updates[0]).toHaveProperty('thumbnailPath');
    expect(deleted.sort()).toEqual(
      [
        `${bucket}/products/acme/widget/main.png`,
        `${thumbnailBucket}/product-thumbnails/v1/acme/widget/thumbnail.webp`,
      ].sort(),
    );
  });

  it('rejects a 21st additional image and removes the uploaded object', async () => {
    const { service, deleted, record } = imageService({
      companyId: 'acme',
      additionalImages: Array.from({ length: 20 }, (_, index) => ({
        bucket,
        path: `products/acme/widget/${index}.png`,
      })),
    });

    await expect(
      service.replaceProductImage('widget', 'additional', {
        additionalImages: [imageFile()],
      }),
    ).rejects.toThrow('at most 20 additional images');
    expect(record.additionalImages as unknown[]).toHaveLength(20);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]).toContain('additional-1-');
  });
});

function imageFile() {
  return {
    buffer: Buffer.from('image'),
    contentType: 'image/png',
    extension: 'png',
    filename: 'image.png',
  };
}

function imageService(record: Record<string, unknown>) {
  const deleted: string[] = [];
  const updates: Record<string, unknown>[] = [];
  const reference = {
    get: () => Promise.resolve({ exists: true, data: () => ({ ...record }) }),
  };
  const firestore = {
    collection: () => ({ doc: () => reference }),
    runTransaction: async <T>(
      callback: (transaction: {
        get: (document: typeof reference) => ReturnType<typeof reference.get>;
        update: (
          document: typeof reference,
          value: Record<string, unknown>,
        ) => void;
      }) => Promise<T>,
    ) =>
      callback({
        get: (document) => document.get(),
        update: (_document, value) => {
          updates.push(value);
          Object.assign(record, value);
        },
      }),
  };
  const storage = {
    bucket: (name: string) => ({
      file: (path: string) => ({
        save: () => Promise.resolve(),
        delete: () => {
          deleted.push(`${name}/${path}`);
          return Promise.resolve();
        },
      }),
    }),
  };
  const service = new ProductMutationService();
  (service as unknown as { firestore: unknown }).firestore = firestore;
  (service as unknown as { storage: unknown }).storage = storage;
  return { service, record, deleted, updates };
}
