import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  const originalPrefix = process.env.GCS_CATALOG_PREFIX;
  const originalAssetBaseUrl = process.env.CATALOG_PUBLIC_ASSET_BASE_URL;

  beforeEach(() => {
    process.env.GCS_CATALOG_PREFIX = '';
    process.env.CATALOG_PUBLIC_ASSET_BASE_URL = 'https://cdn.example.com';
    service = new CatalogService();
  });

  afterAll(() => {
    process.env.GCS_CATALOG_PREFIX = originalPrefix;
    process.env.CATALOG_PUBLIC_ASSET_BASE_URL = originalAssetBaseUrl;
  });

  it('formats labels while preserving uppercase tokens', () => {
    expect(service.formatLabel('IA_Industrial Automation.pdf')).toBe(
      'IA Industrial Automation',
    );
    expect(service.formatLabel('schneider-electric')).toBe(
      'Schneider Electric',
    );
  });

  it('builds navigation only from direct company PDFs with document metadata', () => {
    const catalog = service.buildCatalogNavigation([
      {
        name: 'schneider/PMS_Metering.pdf',
        size: '2048',
        contentType: 'application/pdf',
        updatedAt: '2026-06-16T00:00:00.000Z',
        customMetadata: {
          document_id: '01JABCDEF00000000000000000',
          company_slug: 'schneider',
          category_slug: 'industrial-automation',
          document_slug: 'plc-catalog',
          display_name: 'PLC Catalog',
          original_file_name: 'PMS_Metering.pdf',
        },
      },
      {
        name: 'schneider/old-file.pdf',
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
          document_count: 1,
          categories: [
            {
              category_slug: 'industrial-automation',
              category_name: 'Industrial Automation',
              documents: [
                {
                  document_id: '01JABCDEF00000000000000000',
                  company_slug: 'schneider',
                  category_slug: 'industrial-automation',
                  document_slug: 'plc-catalog',
                  display_name: 'PLC Catalog',
                  thumbnail_url:
                    'https://cdn.example.com/catalog-thumbnails/v1/schneider/PMS_Metering.webp',
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
          documents: [],
        },
      ],
    });
  });
});
