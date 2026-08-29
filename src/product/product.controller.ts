import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import {
  ListCategoriesDto,
  ListProductsDto,
  ProductParamsDto,
} from './dto/list-products.dto';
import { ProductService } from './product.service';

@Controller()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get('companies')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=900')
  getCompanies() {
    return this.productService.getCompanies();
  }

  @Get('categories')
  @Header('Cache-Control', 'public, max-age=300, s-maxage=900')
  getCategories(@Query() query: ListCategoriesDto) {
    return this.productService.getCategories(query.companyId);
  }

  @Get('products')
  @Header('Cache-Control', 'public, max-age=30, s-maxage=60')
  getProducts(@Query() query: ListProductsDto) {
    return this.productService.getProducts(query);
  }

  @Get('products/:productId')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=300')
  getProduct(@Param() params: ProductParamsDto) {
    return this.productService.getProduct(params.productId);
  }
}
