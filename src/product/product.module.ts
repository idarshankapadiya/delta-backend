import { Module } from '@nestjs/common';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';
import { ProductMutationService } from './product-mutation.service';
import { ProductUploadService } from './product-upload.service';

@Module({
  controllers: [ProductController],
  providers: [ProductService, ProductMutationService, ProductUploadService],
  exports: [ProductMutationService, ProductUploadService],
})
export class ProductModule {}
