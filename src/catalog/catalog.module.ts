import { Module } from '@nestjs/common';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogAdminGuard } from './catalog-admin.guard';
import { CatalogController } from './catalog.controller';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { CatalogService } from './catalog.service';
import { CatalogMutationService } from './catalog-mutation.service';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogAccessService,
    CatalogService,
    CatalogRateLimiterService,
    CatalogAdminGuard,
    CatalogMutationService,
  ],
  exports: [CatalogAdminGuard, CatalogMutationService, CatalogService],
})
export class CatalogModule {}
