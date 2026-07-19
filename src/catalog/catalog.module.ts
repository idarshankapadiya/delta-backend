import { Module } from '@nestjs/common';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogAccessGuard } from './catalog-access.guard';
import { CatalogAdminGuard } from './catalog-admin.guard';
import { CatalogController } from './catalog.controller';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { CatalogService } from './catalog.service';
import { CatalogMutationService } from './catalog-mutation.service';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogAccessGuard,
    CatalogAccessService,
    CatalogService,
    CatalogRateLimiterService,
    CatalogAdminGuard,
    CatalogMutationService,
  ],
  exports: [
    CatalogAccessGuard,
    CatalogAdminGuard,
    CatalogMutationService,
    CatalogService,
  ],
})
export class CatalogModule {}
