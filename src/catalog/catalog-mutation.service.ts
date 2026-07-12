import { BadRequestException, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getCatalogUploadMaxBytes } from '../config/catalog.config';
import { CatalogService } from './catalog.service';

interface CatalogMultipartFile {
  buffer: Buffer;
  filename: string;
}

interface CatalogMultipartUpload {
  fields: Record<string, string>;
  file?: CatalogMultipartFile;
}

@Injectable()
export class CatalogMutationService {
  constructor(private readonly catalogService: CatalogService) {}

  async createDocument(request: FastifyRequest) {
    const upload = await this.readCatalogMultipartUpload(request, true, [
      'company_name',
      'category_name',
      'document_name',
    ]);

    if (!upload.file) {
      throw new BadRequestException('PDF file is required');
    }

    return this.catalogService.createCatalogDocument({
      pdf: upload.file.buffer,
      uploadedFileName: upload.file.filename,
      companyName: this.getRequiredField(upload.fields, 'company_name'),
      categoryName: upload.fields.category_name,
      documentName: this.getRequiredField(upload.fields, 'document_name'),
    });
  }

  async updateDocument(documentId: string, request: FastifyRequest) {
    const upload = await this.readCatalogMultipartUpload(request, false, [
      'document_name',
      'category_name',
    ]);

    return this.catalogService.updateCatalogDocument(documentId, {
      pdf: upload.file?.buffer,
      uploadedFileName: upload.file?.filename,
      categoryName: Object.hasOwn(upload.fields, 'category_name')
        ? upload.fields.category_name
        : undefined,
      documentName: Object.hasOwn(upload.fields, 'document_name')
        ? upload.fields.document_name
        : undefined,
    });
  }

  updateCompany(companySlug: string, companyName: string) {
    return this.catalogService.updateCatalogCompany(companySlug, companyName);
  }

  deleteDocument(documentId: string) {
    return this.catalogService.deleteCatalogDocument(documentId);
  }

  private async readCatalogMultipartUpload(
    request: FastifyRequest,
    fileRequired: boolean,
    allowedFields: string[],
  ): Promise<CatalogMultipartUpload> {
    if (!request.isMultipart()) {
      throw new BadRequestException('multipart/form-data is required');
    }

    const fields: Record<string, string> = {};
    let file: CatalogMultipartFile | undefined;

    for await (const part of request.parts({
      limits: {
        files: 1,
        fileSize: getCatalogUploadMaxBytes(),
        fields: 8,
        parts: 10,
      },
    })) {
      if (part.type === 'file') {
        if (part.fieldname !== 'file') {
          throw new BadRequestException('PDF file field must be named file');
        }

        if (file) {
          throw new BadRequestException('Only one PDF file is allowed');
        }

        if (part.mimetype !== 'application/pdf') {
          throw new BadRequestException('Uploaded file must be a PDF');
        }

        file = {
          buffer: await part.toBuffer(),
          filename: part.filename,
        };
        continue;
      }

      if (!allowedFields.includes(part.fieldname)) {
        throw new BadRequestException(
          `Unexpected catalog field: ${part.fieldname}`,
        );
      }

      fields[part.fieldname] = this.getMultipartFieldValue(part.value);
    }

    if (fileRequired && !file) {
      throw new BadRequestException('PDF file is required');
    }

    return { fields, file };
  }

  private getRequiredField(
    fields: Record<string, string>,
    fieldName: string,
  ): string {
    const value = fields[fieldName]?.trim();

    if (!value) {
      throw new BadRequestException(`${fieldName} is required`);
    }

    return value;
  }

  private getMultipartFieldValue(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return '';
  }
}
