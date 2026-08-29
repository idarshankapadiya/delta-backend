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
import {
  CreateProductCategoryDto,
  CreateProductCompanyDto,
  CreateProductDto,
  ProductCategoryParamsDto,
  ProductCompanyParamsDto,
  ProductResourceParamsDto,
  UpdateProductCategoryDto,
  UpdateProductCompanyDto,
  UpdateProductDto,
} from '../product/dto/product-mutation.dto';
import { ProductMutationService } from '../product/product-mutation.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard, BusinessCsrfGuard)
@UseInterceptors(NoStoreInterceptor)
export class BusinessProductController {
  constructor(
    private readonly products: ProductMutationService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Post('companies')
  async createCompany(
    @Body() body: CreateProductCompanyDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.createCompany(body);
    this.auditMutation(request, 'product_company_create');
    return result;
  }

  @Put('companies/:companyId')
  async updateCompany(
    @Param() params: ProductCompanyParamsDto,
    @Body() body: UpdateProductCompanyDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.updateCompany(params.companyId, body);
    this.auditMutation(request, 'product_company_update');
    return result;
  }

  @Delete('companies/:companyId')
  async deleteCompany(
    @Param() params: ProductCompanyParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteCompany(params.companyId);
    this.auditMutation(request, 'product_company_delete');
    return result;
  }

  @Post('categories')
  async createCategory(
    @Body() body: CreateProductCategoryDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.createCategory(body);
    this.auditMutation(request, 'product_category_create');
    return result;
  }

  @Put('categories/:categoryId')
  async updateCategory(
    @Param() params: ProductCategoryParamsDto,
    @Body() body: UpdateProductCategoryDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.updateCategory(params.categoryId, body);
    this.auditMutation(request, 'product_category_update');
    return result;
  }

  @Delete('categories/:categoryId')
  async deleteCategory(
    @Param() params: ProductCategoryParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteCategory(params.categoryId);
    this.auditMutation(request, 'product_category_delete');
    return result;
  }

  @Post('products')
  async createProduct(
    @Body() body: CreateProductDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.createProduct(body);
    this.auditMutation(request, 'product_create');
    return result;
  }

  @Put('products/:productId')
  async updateProduct(
    @Param() params: ProductResourceParamsDto,
    @Body() body: UpdateProductDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.updateProduct(params.productId, body);
    this.auditMutation(request, 'product_update');
    return result;
  }

  @Delete('products/out-of-stock/:productId')
  async deleteOutOfStockProduct(
    @Param() params: ProductResourceParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteOutOfStockProduct(
      params.productId,
    );
    this.auditMutation(request, 'out_of_stock_product_delete');
    return result;
  }

  @Delete('products/:productId')
  async deleteProduct(
    @Param() params: ProductResourceParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteProduct(params.productId);
    this.auditMutation(request, 'product_delete');
    return result;
  }

  private auditMutation(request: FastifyRequest, action: string) {
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
