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
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
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
import { ProductUploadService } from '../product/product-upload.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard, BusinessCsrfGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Products')
@ApiSecurity({ businessSession: [], csrfToken: [] })
export class BusinessProductController {
  constructor(
    private readonly products: ProductMutationService,
    private readonly productUploads: ProductUploadService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Post('companies')
  @ApiOperation({ summary: 'Create a product company' })
  async createCompany(
    @Body() body: CreateProductCompanyDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.createCompany(body);
    this.auditMutation(request, 'product_company_create');
    return result;
  }

  @Put('companies/:companyId')
  @ApiOperation({ summary: 'Update a product company' })
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
  @ApiOperation({ summary: 'Delete an unused product company' })
  async deleteCompany(
    @Param() params: ProductCompanyParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteCompany(params.companyId);
    this.auditMutation(request, 'product_company_delete');
    return result;
  }

  @Post('categories')
  @ApiOperation({ summary: 'Create a product category' })
  async createCategory(
    @Body() body: CreateProductCategoryDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.createCategory(body);
    this.auditMutation(request, 'product_category_create');
    return result;
  }

  @Put('categories/:categoryId')
  @ApiOperation({ summary: 'Update a product category' })
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
  @ApiOperation({ summary: 'Delete an unused product category' })
  async deleteCategory(
    @Param() params: ProductCategoryParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteCategory(params.categoryId);
    this.auditMutation(request, 'product_category_delete');
    return result;
  }

  @Post('products')
  @ApiOperation({
    summary: 'Create a product and optionally its company or category',
  })
  async createProduct(
    @Body() body: CreateProductDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.createProduct(body);
    this.auditMutation(request, 'product_create');
    return result;
  }

  @Post('products/upload')
  @ApiOperation({ summary: 'Create a product and upload its assets' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(productUploadBody(true))
  async createProductUpload(@Req() request: FastifyRequest) {
    const result = await this.productUploads.createProduct(request);
    this.auditMutation(request, 'product_create_with_assets');
    return result;
  }

  @Put('products/:productId')
  @ApiOperation({ summary: 'Update a product' })
  async updateProduct(
    @Param() params: ProductResourceParamsDto,
    @Body() body: UpdateProductDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.updateProduct(params.productId, body);
    this.auditMutation(request, 'product_update');
    return result;
  }

  @Put('products/:productId/upload')
  @ApiOperation({ summary: 'Update a product and upload replacement assets' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(productUploadBody(false))
  async updateProductUpload(
    @Param() params: ProductResourceParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.productUploads.updateProduct(
      params.productId,
      request,
    );
    this.auditMutation(request, 'product_update_with_assets');
    return result;
  }

  @Delete('products/out-of-stock/:productId')
  @ApiOperation({
    summary: 'Delete an out-of-stock product and unused relationships',
    description:
      'Deletes the product only when it is out of stock. Its company and category are also deleted when no other products reference them.',
  })
  @ApiOkResponse(productDeletionResponse())
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
  @ApiOperation({
    summary: 'Delete a product and unused relationships',
    description:
      'Deletes the product. Its company and category are also deleted when no other products reference them.',
  })
  @ApiOkResponse(productDeletionResponse())
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

function productDeletionResponse() {
  return {
    description:
      'The product was deleted. Nullable relationship IDs identify any company or category that was also deleted.',
    schema: {
      type: 'object',
      required: [
        'ok',
        'deletedProductId',
        'deletedAssets',
        'deletedCompanyId',
        'deletedCategoryId',
        'updatedCategories',
      ],
      properties: {
        ok: { type: 'boolean', example: true },
        deletedProductId: { type: 'string' },
        deletedAssets: { type: 'integer', minimum: 0 },
        deletedCompanyId: { type: 'string', nullable: true },
        deletedCategoryId: { type: 'string', nullable: true },
        updatedCategories: { type: 'integer', minimum: 0 },
      },
    },
  };
}

function productUploadBody(create: boolean) {
  return {
    schema: {
      type: 'object',
      required: create ? ['product', 'main_image'] : ['product'],
      properties: {
        product: {
          type: 'string',
          description: create
            ? 'JSON-encoded CreateProductDto payload.'
            : 'JSON-encoded UpdateProductDto payload.',
        },
        main_image: {
          type: 'string',
          format: 'binary',
          description: create
            ? 'Required JPEG, PNG, WebP, or AVIF main image. A WebP thumbnail is generated automatically.'
            : 'Optional replacement main image. A replacement WebP thumbnail is generated automatically.',
        },
        additional_images: {
          type: 'array',
          maxItems: 20,
          items: { type: 'string', format: 'binary' },
          description: 'Optional replacement additional product images.',
        },
        brochure: {
          type: 'string',
          format: 'binary',
          description: 'Optional PDF brochure.',
        },
      },
    },
  };
}
