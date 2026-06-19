import { Module } from '@nestjs/common';
import { CatalogAccessService } from './catalog-access.service';
import { CatalogAdminGuard } from './catalog-admin.guard';
import { CatalogController } from './catalog.controller';
import { CatalogOriginGuard } from './catalog-origin.guard';
import { CatalogRateLimiterService } from './catalog-rate-limiter.service';
import { CatalogService } from './catalog.service';

@Module({
  controllers: [CatalogController],
  providers: [
    CatalogAccessService,
    CatalogService,
    CatalogRateLimiterService,
    CatalogOriginGuard,
    CatalogAdminGuard,
  ],
})
export class CatalogModule {}
