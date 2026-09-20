import { ProductMutationService } from './product-mutation.service';

type CleanupService = {
  deleteCompanyAssetPrefixes(companyId: string): Promise<number>;
  deleteProductAssets(
    productId: string,
    data: Record<string, unknown>,
    deleteCompanyAssets?: boolean,
  ): Promise<number>;
};

describe('ProductMutationService storage cleanup', () => {
  const productBucket = 'product-bucket';
  const thumbnailBucket = 'thumbnail-bucket';

  beforeEach(() => {
    process.env.GCS_PRODUCT_BUCKET = productBucket;
    process.env.GCS_PRODUCT_THUMBNAIL_BUCKET = thumbnailBucket;
  });

  afterEach(() => {
    delete process.env.GCS_PRODUCT_BUCKET;
    delete process.env.GCS_PRODUCT_THUMBNAIL_BUCKET;
    jest.restoreAllMocks();
  });

  it('deletes every object and folder marker under the product prefixes', async () => {
    const { cleanup, deleted, listed } = createCleanupService(
      new Map([
        [
          `${productBucket}:products/acme/widget/`,
          [
            'products/acme/widget/',
            'products/acme/widget/main-current.jpg',
            'products/acme/widget/main-orphaned.jpg',
          ],
        ],
        [
          `${thumbnailBucket}:product-thumbnails/v1/acme/widget/`,
          ['product-thumbnails/v1/acme/widget/thumbnail.webp'],
        ],
      ]),
    );

    const deletedAssets = await cleanup.deleteProductAssets('widget', {
      companyId: 'acme',
      mainImage: {
        bucket: productBucket,
        path: 'products/acme/widget/main-current.jpg',
      },
    });

    expect(listed).toEqual([
      `${productBucket}:products/acme/widget/`,
      `${thumbnailBucket}:product-thumbnails/v1/acme/widget/`,
    ]);
    expect(deleted.sort()).toEqual(
      [
        `${productBucket}:products/acme/widget/`,
        `${productBucket}:products/acme/widget/main-current.jpg`,
        `${productBucket}:products/acme/widget/main-orphaned.jpg`,
        `${thumbnailBucket}:product-thumbnails/v1/acme/widget/thumbnail.webp`,
      ].sort(),
    );
    expect(deletedAssets).toBe(4);
  });

  it('sweeps the whole company prefix after the last product is deleted', async () => {
    const { cleanup, deleted, listed } = createCleanupService(
      new Map([
        [
          `${productBucket}:products/acme/`,
          [
            'products/acme/',
            'products/acme/widget/main.jpg',
            'products/acme/old-product/orphaned.jpg',
          ],
        ],
        [
          `${thumbnailBucket}:product-thumbnails/v1/acme/`,
          ['product-thumbnails/v1/acme/'],
        ],
      ]),
    );

    await cleanup.deleteProductAssets('widget', { companyId: 'acme' }, true);

    expect(listed).toContain(`${productBucket}:products/acme/`);
    expect(listed).toContain(`${thumbnailBucket}:product-thumbnails/v1/acme/`);
    expect(deleted).toContain(`${productBucket}:products/acme/`);
    expect(deleted).toContain(
      `${productBucket}:products/acme/old-product/orphaned.jpg`,
    );
    expect(deleted).toContain(`${thumbnailBucket}:product-thumbnails/v1/acme/`);
  });

  it('cleans both company prefixes when an unused company is deleted directly', async () => {
    const { cleanup, listed } = createCleanupService(new Map());

    await cleanup.deleteCompanyAssetPrefixes('acme');

    expect(listed).toEqual([
      `${productBucket}:products/acme/`,
      `${thumbnailBucket}:product-thumbnails/v1/acme/`,
    ]);
  });

  it('removes empty hierarchical folders from the child up', async () => {
    const { cleanup, deletedFolders } = createCleanupService(
      new Map(),
      new Map([
        [
          `${thumbnailBucket}:product-thumbnails/v1/acme/`,
          ['product-thumbnails/v1/acme/', 'product-thumbnails/v1/acme/widget/'],
        ],
      ]),
    );

    await cleanup.deleteCompanyAssetPrefixes('acme');

    expect(deletedFolders).toEqual([
      `${thumbnailBucket}:product-thumbnails/v1/acme/widget/`,
      `${thumbnailBucket}:product-thumbnails/v1/acme/`,
    ]);
  });
});

function createCleanupService(
  filesByPrefix: Map<string, string[]>,
  foldersByPrefix = new Map<string, string[]>(),
) {
  const deleted: string[] = [];
  const listed: string[] = [];
  const deletedFolders: string[] = [];
  const storage = {
    bucket: (bucket: string) => ({
      file: (path: string) => ({
        delete: () => {
          deleted.push(`${bucket}:${path}`);
          return Promise.resolve();
        },
      }),
      getFiles: ({ prefix }: { prefix: string }) => {
        listed.push(`${bucket}:${prefix}`);
        return Promise.resolve([
          (filesByPrefix.get(`${bucket}:${prefix}`) ?? []).map((name) => ({
            name,
          })),
        ]);
      },
    }),
  };
  const service = new ProductMutationService();
  (service as unknown as { storage: unknown }).storage = storage;
  (service as unknown as { folderAuth: unknown }).folderAuth = {
    getClient: () =>
      Promise.resolve({
        request: ({
          method,
          url,
          params,
        }: {
          method?: string;
          url: string;
          params?: { prefix: string };
        }) => {
          const bucket = url.split('/b/')[1].split('/folders')[0];
          if (method === 'DELETE') {
            deletedFolders.push(
              `${bucket}:${decodeURIComponent(url.split('/folders/')[1])}`,
            );
            return Promise.resolve({ data: {} });
          }
          return Promise.resolve({
            data: {
              items: (
                foldersByPrefix.get(`${bucket}:${params?.prefix}`) ?? []
              ).map((name) => ({ name })),
            },
          });
        },
      }),
  };

  return {
    cleanup: service as unknown as CleanupService,
    deleted,
    listed,
    deletedFolders,
  };
}
