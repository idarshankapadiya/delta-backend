import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { MessageModule } from '../message/message.module';
import { InternalAdminGuard } from './internal-admin.guard';
import { InternalCatalogController } from './internal-catalog.controller';
import { InternalMessageController } from './internal-message.controller';

@Module({
  imports: [CatalogModule, MessageModule],
  controllers: [InternalCatalogController, InternalMessageController],
  providers: [InternalAdminGuard],
})
export class InternalModule {}
