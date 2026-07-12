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
export class InternalCatalogController {
  constructor(private readonly mutations: CatalogMutationService) {}

  @Post('documents')
  createDocument(@Req() request: FastifyRequest) {
    return this.mutations.createDocument(request);
  }

  @Put('documents/:document_id')
  updateDocument(
    @Param() params: CatalogDocumentParamsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.mutations.updateDocument(params.document_id, request);
  }

  @Put('companies/:company_slug')
  updateCompany(
    @Param() params: CatalogCompanyParamsDto,
    @Body() body: UpdateCatalogCompanyDto,
  ) {
    return this.mutations.updateCompany(params.company_slug, body.company_name);
  }

  @Delete('documents/:document_id')
  deleteDocument(@Param() params: CatalogDocumentParamsDto) {
    return this.mutations.deleteDocument(params.document_id);
  }
}
