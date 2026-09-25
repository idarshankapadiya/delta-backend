import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  QuotationParamsDto,
  UpdateQuotationStatusDto,
} from '../quotation/dto/quotation.dto';
import { QuotationService } from '../quotation/quotation.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business/quotation-requests')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Quotations')
export class BusinessQuotationController {
  constructor(
    private readonly quotations: QuotationService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'List quotation requests newest first' })
  @ApiOkResponse({ description: 'Up to 200 latest quotation requests.' })
  async getQuotations(@Req() request: FastifyRequest) {
    const response = await this.quotations.getQuotations();
    this.auditAccess(request, 'quotation_requests_read');
    return response;
  }

  @Get(':quotationId')
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'Get one quotation request' })
  @ApiNotFoundResponse({ description: 'Quotation request not found.' })
  async getQuotation(
    @Param() params: QuotationParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const response = await this.quotations.getQuotation(params.quotationId);
    this.auditAccess(request, 'quotation_request_read');
    return response;
  }

  @Patch(':quotationId/status')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity({ businessSession: [], csrfToken: [] })
  @ApiOperation({ summary: 'Update quotation workflow status' })
  @ApiOkResponse({ description: 'Quotation status updated.' })
  @ApiNotFoundResponse({ description: 'Quotation request not found.' })
  async updateStatus(
    @Param() params: QuotationParamsDto,
    @Body() body: UpdateQuotationStatusDto,
    @Req() request: FastifyRequest,
  ) {
    const response = await this.quotations.updateStatus(
      params.quotationId,
      body.status,
    );
    this.auditAccess(request, 'quotation_request_status_update');
    return response;
  }

  private auditAccess(request: FastifyRequest, action: string): void {
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
