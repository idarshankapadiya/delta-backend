import { Module } from '@nestjs/common';
import { CatalogAdminGuard } from '../catalog/catalog-admin.guard';
import { CatalogOriginGuard } from '../catalog/catalog-origin.guard';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  controllers: [MessageController],
  providers: [MessageService, CatalogOriginGuard, CatalogAdminGuard],
})
export class MessageModule {}
