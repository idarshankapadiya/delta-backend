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
  ApiConflictResponse,
  ApiNotFoundResponse,
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
  ProductImageParamsDto,
  ProductResourceParamsDto,
  ProductSpecificationParamsDto,
  UpdateProductCategoryDto,
  UpdateProductCompanyDto,
  UpdateProductDto,
  UpdateProductSpecificationDto,
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
  @ApiOperation({
    summary: 'Delete an unused product company',
    description:
      'Deletes a company only when no products reference it, removes the company from linked categories, and clears its product and thumbnail storage prefixes, including empty folders.',
  })
  @ApiOkResponse({
    description:
      'The unused company, its owned storage prefixes, and its category links were deleted.',
    schema: {
      type: 'object',
      required: [
        'ok',
        'deletedCompanyId',
        'deletedAssets',
        'updatedCategories',
      ],
      properties: {
        ok: { type: 'boolean', example: true },
        deletedCompanyId: { type: 'string' },
        deletedAssets: { type: 'integer', minimum: 0 },
        updatedCategories: { type: 'integer', minimum: 0 },
      },
    },
  })
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

  @Put('products/:productId/specifications/:key')
  @ApiOperation({
    summary: 'Edit one product specification',
    description:
      'Updates an existing specification value and optionally renames its key. Returns 404 when the product or specification does not exist and 409 when the new key already exists.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['value'],
      properties: {
        key: { type: 'string', minLength: 1, maxLength: 160 },
        value: {
          description: 'String, number, boolean, or null.',
          oneOf: [
            { type: 'string' },
            { type: 'number' },
            { type: 'boolean' },
            { type: 'string', nullable: true, enum: [null] },
          ],
        },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['ok', 'productId', 'key', 'value'],
      properties: {
        ok: { type: 'boolean', example: true },
        productId: { type: 'string' },
        key: { type: 'string' },
        value: {
          description:
            'Updated specification value (string, number, boolean, or null).',
        },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Product or specification not found.' })
  @ApiConflictResponse({ description: 'Replacement key already exists.' })
  async updateProductSpecification(
    @Param() params: ProductSpecificationParamsDto,
    @Body() body: UpdateProductSpecificationDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.updateProductSpecification(
      params.productId,
      params.key,
      body,
    );
    this.auditMutation(request, 'product_specification_update');
    return result;
  }

  @Delete('products/:productId/specifications/:key')
  @ApiOperation({
    summary: 'Delete one product specification',
    description:
      'Removes an existing specification. Returns 404 when the product or specification does not exist.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['ok', 'productId', 'deletedKey'],
      properties: {
        ok: { type: 'boolean', example: true },
        productId: { type: 'string' },
        deletedKey: { type: 'string' },
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Product or specification not found.' })
  async deleteProductSpecification(
    @Param() params: ProductSpecificationParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteProductSpecification(
      params.productId,
      params.key,
    );
    this.auditMutation(request, 'product_specification_delete');
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

  @Put('products/:productId/main-image')
  @ApiOperation({
    summary: 'Replace the main image and regenerate its WebP thumbnail',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(singleImageBody())
  @ApiOkResponse(imageMutationResponse())
  @ApiNotFoundResponse({ description: 'Product not found.' })
  async replaceMainImage(
    @Param() params: ProductResourceParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.productUploads.replaceMainImage(
      params.productId,
      request,
    );
    this.auditMutation(request, 'product_main_image_replace');
    return result;
  }

  @Delete('products/:productId/main-image')
  @ApiOperation({
    summary: 'Delete the main image and generated thumbnail',
    description:
      'Removes the main image and thumbnail objects and clears current and legacy image references from the product.',
  })
  @ApiOkResponse(imageMutationResponse(true))
  @ApiNotFoundResponse({ description: 'Product or main image not found.' })
  async deleteMainImage(
    @Param() params: ProductResourceParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteProductImage(
      params.productId,
      'main',
    );
    this.auditMutation(request, 'product_main_image_delete');
    return result;
  }

  @Post('products/:productId/additional-images')
  @ApiOperation({ summary: 'Append one additional image (maximum 20)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(singleImageBody())
  @ApiOkResponse(imageMutationResponse())
  @ApiNotFoundResponse({ description: 'Product not found.' })
  async addAdditionalImage(
    @Param() params: ProductResourceParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.productUploads.addAdditionalImage(
      params.productId,
      request,
    );
    this.auditMutation(request, 'product_additional_image_add');
    return result;
  }

  @Put('products/:productId/additional-images/:index')
  @ApiOperation({
    summary: 'Replace one additional image by its zero-based index',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(singleImageBody())
  @ApiOkResponse(imageMutationResponse())
  @ApiNotFoundResponse({ description: 'Product or image index not found.' })
  async replaceAdditionalImage(
    @Param() params: ProductImageParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.productUploads.replaceAdditionalImage(
      params.productId,
      Number(params.index),
      request,
    );
    this.auditMutation(request, 'product_additional_image_replace');
    return result;
  }

  @Delete('products/:productId/additional-images/:index')
  @ApiOperation({
    summary: 'Delete one additional image by its zero-based index',
  })
  @ApiOkResponse(imageMutationResponse(true))
  @ApiNotFoundResponse({ description: 'Product or image index not found.' })
  async deleteAdditionalImage(
    @Param() params: ProductImageParamsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.products.deleteProductImage(
      params.productId,
      'additional',
      Number(params.index),
    );
    this.auditMutation(request, 'product_additional_image_delete');
    return result;
  }

  @Delete('products/out-of-stock/:productId')
  @ApiOperation({
    summary: 'Delete an out-of-stock product and unused relationships',
    description:
      'Deletes the product only when it is out of stock and clears its complete product and thumbnail storage prefixes, including empty folders. Its company and category are also deleted when no other products reference them; deleting the last company product clears the company storage prefixes.',
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
    summary: 'Permanently delete a product',
    description:
      'Permanently deletes the selected product regardless of its stock status and clears its complete product and thumbnail storage prefixes, including empty folders. Its company and category are also deleted when no other products reference them; deleting the last company product clears the company storage prefixes. This action cannot be undone.',
  })
  @ApiOkResponse(
    productDeletionResponse(
      'The product and its complete owned storage prefixes were permanently deleted. Nullable relationship IDs identify any company or category that was also deleted.',
    ),
  )
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

function productDeletionResponse(
  description = 'The product was deleted. Nullable relationship IDs identify any company or category that was also deleted.',
) {
  return {
    description,
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
        deletedAssets: {
          type: 'integer',
          minimum: 0,
          description:
            'Number of stored objects removed from the product prefixes, including orphaned objects and folder markers.',
        },
        deletedCompanyId: { type: 'string', nullable: true },
        deletedCategoryId: { type: 'string', nullable: true },
        updatedCategories: { type: 'integer', minimum: 0 },
      },
    },
  };
}

function singleImageBody() {
  return {
    schema: {
      type: 'object',
      required: ['image'],
      properties: {
        image: {
          type: 'string',
          format: 'binary',
          description: 'One JPEG, PNG, WebP, or AVIF image, up to 20 MB.',
        },
      },
    },
  };
}

function imageMutationResponse(deleting = false) {
  return {
    schema: {
      type: 'object',
      required: deleting
        ? ['ok', 'productId', 'image', 'deletedAssets']
        : ['ok', 'productId', 'image'],
      properties: {
        ok: { type: 'boolean', example: true },
        productId: { type: 'string' },
        image: { type: 'string', enum: ['main', 'additional'] },
        index: {
          type: 'integer',
          minimum: 0,
          description: 'Zero-based additional image index.',
        },
        deletedAssets: { type: 'integer', minimum: 0 },
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
