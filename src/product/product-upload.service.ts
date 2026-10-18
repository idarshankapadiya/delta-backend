import {
  BadRequestException,
  Injectable,
  ValidationPipe,
  type Type,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import sharp from 'sharp';
import {
  getProductBrochureUploadMaxBytes,
  getProductImageUploadMaxBytes,
  getProductMultipartFileMaxBytes,
  getProductThumbnailQuality,
  getProductThumbnailWidth,
  getProductUploadTotalMaxBytes,
} from '../config/product.config';
import { CreateProductDto, UpdateProductDto } from './dto/product-mutation.dto';
import { ProductMutationService } from './product-mutation.service';
import type {
  ProductUploadFile,
  ProductUploadFiles,
} from './product-upload.types';

const MAX_ADDITIONAL_IMAGES = 20;
const IMAGE_CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class ProductUploadService {
  private readonly validationPipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  constructor(private readonly products: ProductMutationService) {}

  async createProduct(request: FastifyRequest) {
    const upload = await this.readProductUpload(
      request,
      CreateProductDto,
      true,
    );
    return this.products.createProduct(upload.input, upload.files);
  }

  async updateProduct(productId: string, request: FastifyRequest) {
    const upload = await this.readProductUpload(request, UpdateProductDto);
    return this.products.updateProduct(productId, upload.input, upload.files);
  }

  async replaceMainImage(productId: string, request: FastifyRequest) {
    const image = await this.readSingleImage(request);
    const thumbnail = await this.createThumbnail(image);
    return this.products.replaceProductImage(productId, 'main', {
      mainImage: image,
      thumbnail,
    });
  }

  async addAdditionalImage(productId: string, request: FastifyRequest) {
    const image = await this.readSingleImage(request);
    return this.products.replaceProductImage(productId, 'additional', {
      additionalImages: [image],
    });
  }

  async replaceAdditionalImage(
    productId: string,
    index: number,
    request: FastifyRequest,
  ) {
    const image = await this.readSingleImage(request);
    return this.products.replaceProductImage(
      productId,
      'additional',
      { additionalImages: [image] },
      index,
    );
  }

  private async readSingleImage(
    request: FastifyRequest,
  ): Promise<ProductUploadFile> {
    if (!request.isMultipart()) {
      throw new BadRequestException('multipart/form-data is required');
    }
    let image: ProductUploadFile | undefined;
    for await (const part of request.parts({
      limits: {
        files: 1,
        fields: 0,
        fileSize: getProductImageUploadMaxBytes(),
        parts: 1,
      },
    })) {
      if (part.type !== 'file' || part.fieldname !== 'image' || image) {
        throw new BadRequestException(
          'Exactly one image file is required in the image field',
        );
      }
      image = await this.imageFile(await part.toBuffer(), part.filename);
    }
    if (!image) throw new BadRequestException('Image file is required');
    return image;
  }

  private async readProductUpload<T extends object>(
    request: FastifyRequest,
    dto: Type<T>,
    mainImageRequired = false,
  ): Promise<{ input: T; files: ProductUploadFiles }> {
    if (!request.isMultipart()) {
      throw new BadRequestException('multipart/form-data is required');
    }

    let productJson: string | undefined;
    let totalBytes = 0;
    const files: ProductUploadFiles = {};

    for await (const part of request.parts({
      limits: {
        files: MAX_ADDITIONAL_IMAGES + 2,
        fileSize: getProductMultipartFileMaxBytes(),
        fields: 1,
        parts: MAX_ADDITIONAL_IMAGES + 3,
      },
    })) {
      if (part.type === 'field') {
        if (part.fieldname !== 'product' || productJson !== undefined) {
          throw new BadRequestException(
            `Unexpected product field: ${part.fieldname}`,
          );
        }
        productJson = this.multipartFieldValue(part.value);
        continue;
      }

      const buffer = await part.toBuffer();
      totalBytes += buffer.length;
      if (totalBytes > getProductUploadTotalMaxBytes()) {
        throw new BadRequestException(
          'The combined product upload is too large',
        );
      }

      if (part.fieldname === 'main_image') {
        if (files.mainImage) {
          throw new BadRequestException('Only one main image is allowed');
        }
        files.mainImage = await this.imageFile(buffer, part.filename);
      } else if (part.fieldname === 'additional_images') {
        const additionalImages = files.additionalImages ?? [];
        if (additionalImages.length >= MAX_ADDITIONAL_IMAGES) {
          throw new BadRequestException(
            `A product can have at most ${MAX_ADDITIONAL_IMAGES} additional images`,
          );
        }
        additionalImages.push(await this.imageFile(buffer, part.filename));
        files.additionalImages = additionalImages;
      } else if (part.fieldname === 'brochure') {
        if (files.brochure) {
          throw new BadRequestException('Only one brochure is allowed');
        }
        files.brochure = this.brochureFile(buffer, part.filename);
      } else {
        throw new BadRequestException(
          `Unexpected product file field: ${part.fieldname}`,
        );
      }
    }

    if (mainImageRequired && !files.mainImage) {
      throw new BadRequestException('Main image is required');
    }
    if (files.mainImage) {
      files.thumbnail = await this.createThumbnail(files.mainImage);
    }

    if (!productJson) {
      throw new BadRequestException('Product JSON field is required');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(productJson);
    } catch {
      throw new BadRequestException('Product JSON field is invalid');
    }

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new BadRequestException('Product JSON field must be an object');
    }

    const input = (await this.validationPipe.transform(parsed, {
      type: 'body',
      metatype: dto,
      data: 'product',
    })) as T;

    return { input, files };
  }

  private async imageFile(
    buffer: Buffer,
    filename: string,
  ): Promise<ProductUploadFile> {
    if (!buffer.length) {
      throw new BadRequestException('Uploaded images cannot be empty');
    }
    if (buffer.length > getProductImageUploadMaxBytes()) {
      throw new BadRequestException('Each product image must be 20 MB or less');
    }

    let format: string | undefined;
    try {
      format = (await sharp(buffer).metadata()).format;
    } catch {
      throw new BadRequestException('Uploaded image content is invalid');
    }

    if (!format || !IMAGE_CONTENT_TYPES[format]) {
      throw new BadRequestException(
        'Product images must be JPEG, PNG, WebP, or AVIF',
      );
    }
    return {
      buffer,
      contentType: IMAGE_CONTENT_TYPES[format],
      extension: format === 'jpeg' ? 'jpg' : format,
      filename: filename || `image.${format}`,
    };
  }

  private async createThumbnail(
    mainImage: ProductUploadFile,
  ): Promise<ProductUploadFile> {
    let buffer: Buffer;
    try {
      buffer = await sharp(mainImage.buffer)
        .rotate()
        .resize({
          width: getProductThumbnailWidth(),
          withoutEnlargement: true,
        })
        .webp({ quality: getProductThumbnailQuality() })
        .toBuffer();
    } catch {
      throw new BadRequestException(
        'Unable to create a thumbnail from the main image',
      );
    }

    return {
      buffer,
      contentType: 'image/webp',
      extension: 'webp',
      filename: `${mainImage.filename.replace(/\.[^.]+$/, '') || 'thumbnail'}.webp`,
    };
  }

  private brochureFile(buffer: Buffer, filename: string): ProductUploadFile {
    if (!buffer.length || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new BadRequestException('The product brochure must be a PDF');
    }
    if (buffer.length > getProductBrochureUploadMaxBytes()) {
      throw new BadRequestException(
        'The product brochure must be 100 MB or less',
      );
    }

    return {
      buffer,
      contentType: 'application/pdf',
      extension: 'pdf',
      filename: filename || 'brochure.pdf',
    };
  }

  private multipartFieldValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
