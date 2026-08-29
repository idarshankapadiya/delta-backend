import { Module } from '@nestjs/common';
import { BusinessAuthController } from './business-auth.controller';
import { BusinessAuthService } from './business-auth.service';
import { BusinessAuthStore } from './business-auth.store';
import { EnvBusinessAuthorizationProvider } from './business-authorization.provider';
import { BusinessAuthGuard } from './business-auth.guard';
import { BusinessCsrfGuard } from './business-csrf.guard';
import { BusinessCatalogController } from './business-catalog.controller';
import { BusinessMessageController } from './business-message.controller';
import { CatalogModule } from '../catalog/catalog.module';
import { MessageModule } from '../message/message.module';
import { ProductModule } from '../product/product.module';
import { BusinessProductController } from './business-product.controller';

@Module({
  imports: [CatalogModule, MessageModule, ProductModule],
  controllers: [
    BusinessAuthController,
    BusinessCatalogController,
    BusinessMessageController,
    BusinessProductController,
  ],
  providers: [
    BusinessAuthGuard,
    BusinessAuthService,
    BusinessAuthStore,
    BusinessCsrfGuard,
    EnvBusinessAuthorizationProvider,
  ],
  exports: [BusinessAuthGuard, BusinessAuthService, BusinessCsrfGuard],
})
export class BusinessModule {}
