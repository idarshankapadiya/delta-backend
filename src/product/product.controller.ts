import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ListCategoriesDto,
  ListProductsDto,
  ProductParamsDto,
} from './dto/list-products.dto';
import { ProductService } from './product.service';

@Controller()
@ApiTags('Products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('companies')
  @ApiOperation({ summary: 'List active product companies' })
  @Header('Cache-Control', 'public, max-age=300, s-maxage=900')
  getCompanies() {
    return this.productService.getCompanies();
  }

  @Get('categories')
  @ApiOperation({ summary: 'List active product categories' })
  @Header('Cache-Control', 'public, max-age=300, s-maxage=900')
  getCategories(@Query() query: ListCategoriesDto) {
    return this.productService.getCategories(query.companyId);
  }

  @Get('products')
  @ApiOperation({ summary: 'List and filter active products' })
  @Header('Cache-Control', 'public, max-age=30, s-maxage=60')
  getProducts(@Query() query: ListProductsDto) {
    return this.productService.getProducts(query);
  }

  @Get('products/:productId')
  @ApiOperation({
    summary: 'Get active product details',
    description:
      'Returns mainImageUrl, additionalImageUrls, and parallel additionalImageIndices. Each index identifies the stored additional image for the business replace and delete endpoints.',
  })
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300')
  getProduct(@Param() params: ProductParamsDto) {
    return this.productService.getProduct(params.productId);
  }
}
