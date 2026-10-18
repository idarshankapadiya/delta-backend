import type { FastifyRequest } from 'fastify';
import sharp from 'sharp';
import { ProductMutationService } from './product-mutation.service';
import { ProductUploadService } from './product-upload.service';
import type { ProductUploadFiles } from './product-upload.types';

describe('ProductUploadService', () => {
  const products = {
    createProduct: jest.fn(),
    updateProduct: jest.fn(),
  };
  const service = new ProductUploadService(
    products as unknown as ProductMutationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a WebP thumbnail from the main image', async () => {
    const mainImage = await createImage('png');
    const input = {
      name: 'Motor starter',
      companyId: 'schneider',
      categoryId: 'starters',
      price: 1250,
      inStock: true,
    };
    products.createProduct.mockResolvedValue({
      ok: true,
      productId: 'motor-starter',
    });

    await service.createProduct(
      createMultipartRequest([
        { fieldname: 'product', value: JSON.stringify(input) },
        {
          fieldname: 'main_image',
          filename: 'main.png',
          buffer: mainImage,
        },
      ]),
    );

    expect(products.createProduct).toHaveBeenCalledTimes(1);
    const [actualInput, actualFiles] = products.createProduct.mock.calls[0] as [
      typeof input,
      ProductUploadFiles,
    ];
    expect(actualInput).toEqual(expect.objectContaining(input));
    expect(actualFiles.mainImage).toEqual({
      buffer: mainImage,
      contentType: 'image/png',
      extension: 'png',
      filename: 'main.png',
    });
    expect(actualFiles.thumbnail).toEqual(
      expect.objectContaining({
        contentType: 'image/webp',
        extension: 'webp',
        filename: 'main.webp',
      }),
    );
    expect(await sharp(actualFiles.thumbnail?.buffer).metadata()).toEqual(
      expect.objectContaining({ format: 'webp' }),
    );
  });

  it('requires a main image when creating a product', async () => {
    await expect(
      service.createProduct(
        createMultipartRequest([
          {
            fieldname: 'product',
            value: JSON.stringify({
              name: 'Motor starter',
              companyId: 'schneider',
              categoryId: 'starters',
              price: 1250,
              inStock: true,
            }),
          },
        ]),
      ),
    ).rejects.toThrow('Main image is required');
  });
});

function createMultipartRequest(
  parts: Array<
    | { fieldname: string; value: string }
    | { fieldname: string; filename: string; buffer: Buffer }
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

function createImage(format: 'png' | 'webp') {
  const image = sharp({
    create: {
      width: 2,
      height: 2,
      channels: 3,
      background: '#ffffff',
    },
  });
  return format === 'webp' ? image.webp().toBuffer() : image.png().toBuffer();
}
