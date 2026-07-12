import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import {
  BusinessSiteOriginGuard,
  PublicSiteOriginGuard,
} from './origin.guards';
import { SecurityAuditService } from './security-audit.service';
import { NoStoreInterceptor } from './no-store.interceptor';
import { ServiceBoundaryGuard } from './service-boundary.guard';

@Global()
@Module({
  providers: [
    BusinessSiteOriginGuard,
    PublicSiteOriginGuard,
    SecurityAuditService,
    NoStoreInterceptor,
    ServiceBoundaryGuard,
    {
      provide: APP_GUARD,
      useExisting: ServiceBoundaryGuard,
    },
  ],
  exports: [
    BusinessSiteOriginGuard,
    PublicSiteOriginGuard,
    SecurityAuditService,
    NoStoreInterceptor,
  ],
})
export class SecurityModule {}
