import {
  Body,
  Controller,
  Delete,
  Get,
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
  ApiCookieAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CatalogMutationService } from '../catalog/catalog-mutation.service';
import { CatalogService } from '../catalog/catalog.service';
import { CatalogCompanyParamsDto } from '../catalog/dto/catalog-company-params.dto';
import { CatalogDocumentParamsDto } from '../catalog/dto/catalog-document-params.dto';
import { UpdateCatalogCompanyDto } from '../catalog/dto/update-catalog-company.dto';
import { DocumentAccessDto } from '../catalog/dto/document-access.dto';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business/catalog')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Catalog')
export class BusinessCatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly mutations: CatalogMutationService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get('all')
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'Get catalog data for business administration' })
  getCatalogAll() {
    return this.catalogService.getCatalogAll();
  }

  @Post('documents')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Upload a catalog PDF document' })
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
  async createDocument(@Req() request: FastifyRequest) {
    const result = await this.mutations.createDocument(request);
    this.auditMutation(request, 'catalog_document_create');
    return result;
  }

  @Post('documents/access')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Create an administrative signed document URL' })
  createDocumentAccess(@Body() body: DocumentAccessDto) {
    return this.catalogService.createSignedUrlForSelection(body, body.action);
  }

  @Put('documents/:document_id')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Update or replace a catalog PDF document' })
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
  async updateDocument(
    @Param() params: CatalogDocumentParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.mutations.updateDocument(
      params.document_id,
      request,
    );
    this.auditMutation(request, 'catalog_document_update');
    return result;
  }

  @Put('companies/:company_slug')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Rename or merge a catalog company' })
  async updateCompany(
    @Param() params: CatalogCompanyParamsDto,
    @Body() body: UpdateCatalogCompanyDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.mutations.updateCompany(
      params.company_slug,
      body.company_name,
    );
    this.auditMutation(request, 'catalog_company_update');
    return result;
  }

  @Delete('documents/:document_id')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Delete a catalog document' })
  async deleteDocument(
    @Param() params: CatalogDocumentParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.mutations.deleteDocument(params.document_id);
    this.auditMutation(request, 'catalog_document_delete');
    return result;
  }

  private auditMutation(request: FastifyRequest, action: string): void {
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action,
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
  }
}
