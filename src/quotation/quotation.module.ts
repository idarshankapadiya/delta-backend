import { Module } from '@nestjs/common';
import { MessageModule } from '../message/message.module';
import { ProductModule } from '../product/product.module';
import { QuotationNotificationService } from './quotation-notification.service';
import { QuotationController } from './quotation.controller';
import { QuotationService } from './quotation.service';

@Module({
  imports: [MessageModule, ProductModule],
  controllers: [QuotationController],
  providers: [QuotationService, QuotationNotificationService],
  exports: [QuotationService],
})
export class QuotationModule {}
