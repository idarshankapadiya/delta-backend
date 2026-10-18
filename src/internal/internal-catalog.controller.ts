import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CatalogMutationService } from '../catalog/catalog-mutation.service';
import { CatalogCompanyParamsDto } from '../catalog/dto/catalog-company-params.dto';
import { CatalogDocumentParamsDto } from '../catalog/dto/catalog-document-params.dto';
import { UpdateCatalogCompanyDto } from '../catalog/dto/update-catalog-company.dto';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { InternalAdminGuard } from './internal-admin.guard';

@Controller('internal/catalog')
@UseGuards(InternalAdminGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Internal Catalog')
@ApiSecurity('internalAdmin')
export class InternalCatalogController {
  constructor(private readonly mutations: CatalogMutationService) {}

  @Post('documents')
  @ApiOperation({ summary: 'Upload a catalog PDF through the internal API' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['company_name', 'document_name', 'file'],
      properties: {
        company_name: { type: 'string' },
        category_name: { type: 'string' },
        document_name: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  createDocument(@Req() request: FastifyRequest) {
    return this.mutations.createDocument(request);
  }

  @Put('documents/:document_id')
  @ApiOperation({ summary: 'Update a catalog PDF through the internal API' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        document_name: { type: 'string' },
        category_name: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  updateDocument(
    @Param() params: CatalogDocumentParamsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.mutations.updateDocument(params.document_id, request);
  }

  @Put('companies/:company_slug')
  @ApiOperation({
    summary: 'Rename a catalog company through the internal API',
  })
  updateCompany(
    @Param() params: CatalogCompanyParamsDto,
    @Body() body: UpdateCatalogCompanyDto,
  ) {
    return this.mutations.updateCompany(params.company_slug, body.company_name);
  }

  @Delete('documents/:document_id')
  @ApiOperation({
    summary: 'Delete a catalog document through the internal API',
  })
  deleteDocument(@Param() params: CatalogDocumentParamsDto) {
    return this.mutations.deleteDocument(params.document_id);
  }
}
