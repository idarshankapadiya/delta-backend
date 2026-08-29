import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductMutationService } from './product-mutation.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, ProductMutationService],
  exports: [ProductMutationService],
})
export class ProductModule {}
