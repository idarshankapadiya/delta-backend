import type { FastifyRequest } from 'fastify';
import { CatalogMutationService } from './catalog-mutation.service';
import { CatalogService } from './catalog.service';

describe('CatalogMutationService', () => {
  const catalogService = {
    createCatalogDocument: jest.fn(),
  };
  const service = new CatalogMutationService(
    catalogService as unknown as CatalogService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes names to create and rejects writable slug fields', async () => {
    catalogService.createCatalogDocument.mockResolvedValue({
      document_id: '01JABCDEF00000000000000000',
    });

    await service.createDocument(
      createMultipartRequest([
        { fieldname: 'company_name', value: 'L & T' },
        { fieldname: 'document_name', value: 'Price List 2026' },
        {
          fieldname: 'file',
          filename: 'price-list.pdf',
          mimetype: 'application/pdf',
          buffer: Buffer.from('%PDF-1.7'),
        },
      ]),
    );

    expect(catalogService.createCatalogDocument).toHaveBeenCalledWith({
      pdf: Buffer.from('%PDF-1.7'),
      uploadedFileName: 'price-list.pdf',
      companyName: 'L & T',
      categoryName: undefined,
      documentName: 'Price List 2026',
    });

    await expect(
      service.createDocument(
        createMultipartRequest([
          { fieldname: 'company_slug', value: 'l-t' },
          { fieldname: 'company_name', value: 'L & T' },
          { fieldname: 'document_name', value: 'Price List 2026' },
        ]),
      ),
    ).rejects.toThrow('Unexpected catalog field: company_slug');
  });

  it('rejects octet-stream catalog uploads', async () => {
    await expect(
      service.createDocument(
        createMultipartRequest([
          {
            fieldname: 'file',
            filename: 'catalog.pdf',
            mimetype: 'application/octet-stream',
            buffer: Buffer.from('%PDF-1.7'),
          },
        ]),
      ),
    ).rejects.toThrow('Uploaded file must be a PDF');
  });
});

function createMultipartRequest(
  parts: Array<
    | { fieldname: string; value: string }
    | {
        fieldname: string;
        filename: string;
        mimetype: string;
        buffer: Buffer;
      }
  >,
): FastifyRequest {
  return {
    isMultipart: () => true,
    parts: async function* () {
      await Promise.resolve();

      for (const part of parts) {
        if ('buffer' in part) {
          yield {
            type: 'file',
            fieldname: part.fieldname,
            filename: part.filename,
            mimetype: part.mimetype,
            toBuffer: () => Promise.resolve(part.buffer),
          };
        } else {
          yield {
            type: 'field',
            fieldname: part.fieldname,
            value: part.value,
          };
        }
      }
    },
  } as unknown as FastifyRequest;
}
