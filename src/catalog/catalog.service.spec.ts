import { CatalogService } from './catalog.service';

interface GcsFileDouble {
  name: string;
  copy: jest.Mock;
  delete: jest.Mock;
  exists: jest.Mock;
  getMetadata: jest.Mock;
  save: jest.Mock;
  setMetadata: jest.Mock;
}

describe('CatalogService', () => {
  let service: CatalogService;
  const originalPrefix = process.env.GCS_CATALOG_PREFIX;
  const originalAssetBaseUrl = process.env.CATALOG_PUBLIC_ASSET_BASE_URL;
  const originalBucket = process.env.GCS_CATALOG_BUCKET;
  const originalAssetBucket = process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET;

  beforeEach(() => {
    process.env.GCS_CATALOG_PREFIX = '';
    process.env.CATALOG_PUBLIC_ASSET_BASE_URL = 'https://cdn.example.com';
    process.env.GCS_CATALOG_BUCKET = 'catalog-private';
    process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET = 'catalog-public';
    service = new CatalogService();
  });

  afterAll(() => {
    process.env.GCS_CATALOG_PREFIX = originalPrefix;
    process.env.CATALOG_PUBLIC_ASSET_BASE_URL = originalAssetBaseUrl;
    process.env.GCS_CATALOG_BUCKET = originalBucket;
    process.env.GCS_CATALOG_PUBLIC_ASSET_BUCKET = originalAssetBucket;
  });

  it('formats labels while preserving uppercase tokens', () => {
    expect(service.formatLabel('IA_Industrial Automation.pdf')).toBe(
      'IA Industrial Automation',
    );
    expect(service.formatLabel('schneider-electric')).toBe(
      'Schneider Electric',
    );
    expect(service.formatLabel('project_fd-wd')).toBe('Project Fd Wd');
  });

  it('derives slugs directly from names without URL decoding', () => {
    expect(service.slugifyName('Price List 19-06-2026')).toBe(
      'price-list-19-06-2026',
    );
    expect(service.slugifyName('L&T')).toBe('l-t');
    expect(service.slugifyName('L & T')).toBe('l-t');
    expect(service.slugifyName('The Display-name')).toBe('the-display-name');
    expect(service.slugifyName('The%20Name')).toBe('the-20name');
    expect(service.slugifyName('%%%')).toBe('');
  });

  it('rejects invalid PDF content before accessing storage', async () => {
    await expect(
      service.createCatalogDocument({
        pdf: Buffer.from('not a pdf'),
        uploadedFileName: 'catalog.pdf',
        companyName: 'Schneider',
        documentName: 'PLC Catalog',
      }),
    ).rejects.toThrow('Uploaded file is not a valid PDF');

    await expect(
      service.createCatalogDocument({
        pdf: Buffer.alloc(0),
        uploadedFileName: 'catalog.pdf',
        companyName: 'Schneider',
        documentName: 'PLC Catalog',
      }),
    ).rejects.toThrow('Uploaded PDF is empty');

    await expect(
      service.createCatalogDocument({
        pdf: Buffer.from('%PDF-1.7'),
        uploadedFileName: 'catalog.docx',
        companyName: 'Schneider',
        documentName: 'PLC Catalog',
      }),
    ).rejects.toThrow('Uploaded file must be a PDF');
  });

  it('keeps document identity stable while renaming and moving category', async () => {
    const storage = installStorageDouble(service);
    installObjectListing(service, [
      {
        name: 'schneider/old-category/catalog.pdf',
        size: '2048',
        contentType: 'application/pdf',
        customMetadata: {
          document_id: '01JABCDEF00000000000000000',
          company_name: 'Schneider',
          company_slug: 'schneider',
          category_name: 'Old Category',
          category_slug: 'old-category',
          document_name: 'PLC Catalog',
          document_slug: 'plc-catalog',
          original_file_name: 'catalog.pdf',
          uploaded_at: '2026-06-16T00:00:00.000Z',
        },
      },
    ]);
    storage
      .file(
        'catalog-public',
        'catalog-thumbnails/v1/schneider/old-category/catalog.webp',
      )
      .exists.mockResolvedValue([true]);

    await expect(
      service.updateCatalogDocument('01JABCDEF00000000000000000', {
        documentName: 'PLC Catalog 2026',
        categoryName: 'New Category',
      }),
    ).resolves.toMatchObject({
      document_id: '01JABCDEF00000000000000000',
      object_name: 'schneider/new-category/catalog.pdf',
      category_name: 'New Category',
      category_slug: 'new-category',
      document_name: 'PLC Catalog 2026',
      document_slug: 'plc-catalog-2026',
    });

    const sourcePdf = storage.file(
      'catalog-private',
      'schneider/old-category/catalog.pdf',
    );
    const destinationPdf = storage.file(
      'catalog-private',
      'schneider/new-category/catalog.pdf',
    );
    const sourceThumbnail = storage.file(
      'catalog-public',
      'catalog-thumbnails/v1/schneider/old-category/catalog.webp',
    );
    const destinationThumbnail = storage.file(
      'catalog-public',
      'catalog-thumbnails/v1/schneider/new-category/catalog.webp',
    );

    expect(sourcePdf.copy).toHaveBeenCalledWith(destinationPdf);
    expect(sourceThumbnail.copy).toHaveBeenCalledWith(destinationThumbnail);
    expect(sourcePdf.delete).toHaveBeenCalled();
    expect(sourceThumbnail.delete).toHaveBeenCalled();
  });

  it('renames a company prefix without changing document ids', async () => {
    const storage = installStorageDouble(service);
    installObjectListing(service, [
      {
        name: 'schneider/catalog.pdf',
        customMetadata: {
          document_id: '01JABCDEF00000000000000000',
          company_name: 'Schneider',
          company_slug: 'schneider',
          document_name: 'PLC Catalog',
          document_slug: 'plc-catalog',
          original_file_name: 'catalog.pdf',
          uploaded_at: '2026-06-16T00:00:00.000Z',
        },
      },
    ]);
    storage
      .file('catalog-public', 'catalog-thumbnails/v1/schneider/catalog.webp')
      .exists.mockResolvedValue([true]);

    await expect(
      service.updateCatalogCompany('schneider', 'Schneider Electric'),
    ).resolves.toEqual({
      ok: true,
      previous_company_slug: 'schneider',
      company_slug: 'schneider-electric',
      company_name: 'Schneider Electric',
      moved_document_count: 1,
      merged: false,
    });

    const destinationPdf = storage.file(
      'catalog-private',
      'schneider-electric/catalog.pdf',
    );
    expect(destinationPdf.setMetadata).toHaveBeenCalledWith({
      metadata: {
        document_id: '01JABCDEF00000000000000000',
        company_name: 'Schneider Electric',
        company_slug: 'schneider-electric',
        category_name: null,
        category_slug: null,
        document_name: 'PLC Catalog',
        document_slug: 'plc-catalog',
        display_name: null,
        original_file_name: 'catalog.pdf',
        uploaded_at: '2026-06-16T00:00:00.000Z',
      },
    });
  });

  it('rejects a document rename that collides within the company', async () => {
    installObjectListing(service, [
      {
        name: 'schneider/plc.pdf',
        customMetadata: {
          document_id: '01JDOCUMENT0000000000000001',
          company_name: 'Schneider',
          company_slug: 'schneider',
          document_name: 'PLC Catalog',
          document_slug: 'plc-catalog',
          original_file_name: 'plc.pdf',
        },
      },
      {
        name: 'schneider/price-list.pdf',
        customMetadata: {
          document_id: '01JDOCUMENT0000000000000002',
          company_name: 'Schneider',
          company_slug: 'schneider',
          document_name: 'Price List',
          document_slug: 'price-list',
          original_file_name: 'price-list.pdf',
        },
      },
    ]);

    await expect(
      service.updateCatalogDocument('01JDOCUMENT0000000000000001', {
        documentName: 'Price List',
      }),
    ).rejects.toThrow('Catalog document already exists');
  });

  it('builds navigation from company and optional category PDF paths', () => {
    const catalog = service.buildCatalogNavigation([
      {
        name: 'schneider/industrial-automation/PMS_Metering.pdf',
        size: '2048',
        contentType: 'application/pdf',
        updatedAt: '2026-06-16T00:00:00.000Z',
        customMetadata: {
          document_id: '01JABCDEF00000000000000000',
          company_name: 'Schneider',
          company_slug: 'schneider',
          category_name: 'Industrial Automation',
          category_slug: 'industrial-automation',
          document_slug: 'plc-catalog',
          document_name: 'PLC Catalog',
          original_file_name: 'PMS_Metering.pdf',
        },
      },
      {
        name: 'schneider/old-file.pdf',
      },
      {
        name: 'schneider/legacy-display-name.pdf',
        customMetadata: {
          document_id: '01JLEGACYDISPLAY00000000000',
          company_name: 'Schneider',
          company_slug: 'schneider',
          document_slug: 'legacy-display-name',
          display_name: 'Legacy Display Name',
          original_file_name: 'legacy-display-name.pdf',
        },
      },
      {
        name: 'schneider/Price_List.pdf',
        size: '1024',
        contentType: 'application/pdf',
        customMetadata: {
          document_id: '01JPRICE000000000000000000',
          company_name: 'Schneider',
          company_slug: 'schneider',
          document_slug: 'price-list',
          document_name: 'Price List',
          original_file_name: 'Price_List.pdf',
        },
      },
      {
        name: 'schneider/legacy-current/current.pdf',
        customMetadata: {
          documentId: '01JLEGACY0000000000000000',
          companySlug: 'schneider',
          documentSlug: 'legacy-current',
          displayName: 'Legacy Current',
        },
      },
    ]);

    expect(catalog).toEqual({
      companies: [
        {
          company_slug: 'schneider',
          company_name: 'Schneider',
          document_count: 2,
          categories: [
            {
              category_slug: 'industrial-automation',
              category_name: 'Industrial Automation',
              documents: [
                {
                  document_id: '01JABCDEF00000000000000000',
                  company_slug: 'schneider',
                  company_name: 'Schneider',
                  category_slug: 'industrial-automation',
                  category_name: 'Industrial Automation',
                  document_slug: 'plc-catalog',
                  document_name: 'PLC Catalog',
                  thumbnail_url:
                    'https://cdn.example.com/catalog-thumbnails/v1/schneider/industrial-automation/PMS_Metering.webp',
                  metadata: {
                    size: 2048,
                    sizeLabel: '2.0 KB',
                    contentType: 'application/pdf',
                    createdAt: undefined,
                    updatedAt: '2026-06-16T00:00:00.000Z',
                    updatedLabel: '16 Jun 2026',
                  },
                },
              ],
            },
          ],
          documents: [
            {
              document_id: '01JPRICE000000000000000000',
              company_slug: 'schneider',
              company_name: 'Schneider',
              category_slug: undefined,
              category_name: undefined,
              document_slug: 'price-list',
              document_name: 'Price List',
              thumbnail_url:
                'https://cdn.example.com/catalog-thumbnails/v1/schneider/Price_List.webp',
              metadata: {
                size: 1024,
                sizeLabel: '1.0 KB',
                contentType: 'application/pdf',
                createdAt: undefined,
                updatedAt: undefined,
                updatedLabel: undefined,
              },
            },
          ],
        },
      ],
    });
  });
});

function installObjectListing(
  service: CatalogService,
  objects: Array<{
    name: string;
    size?: string;
    contentType?: string;
    customMetadata?: Record<string, string>;
  }>,
): void {
  (
    service as unknown as {
      listPdfObjects: jest.Mock;
    }
  ).listPdfObjects = jest.fn().mockResolvedValue(objects);
}

function installStorageDouble(service: CatalogService): {
  file: (bucketName: string, objectName: string) => GcsFileDouble;
} {
  const files = new Map<string, GcsFileDouble>();
  const file = (bucketName: string, objectName: string): GcsFileDouble => {
    const key = `${bucketName}/${objectName}`;
    const existing = files.get(key);

    if (existing) {
      return existing;
    }

    const created: GcsFileDouble = {
      name: objectName,
      copy: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue([false]),
      getMetadata: jest.fn().mockResolvedValue([
        {
          size: '2048',
          contentType: 'application/pdf',
          updated: '2026-06-17T00:00:00.000Z',
        },
      ]),
      save: jest.fn().mockResolvedValue(undefined),
      setMetadata: jest.fn().mockResolvedValue([]),
    };
    files.set(key, created);
    return created;
  };

  (
    service as unknown as {
      storage: {
        bucket: (bucketName: string) => {
          file: (objectName: string) => GcsFileDouble;
        };
      };
    }
  ).storage = {
    bucket: (bucketName: string) => ({
      file: (objectName: string) => file(bucketName, objectName),
    }),
  };

  return { file };
}
