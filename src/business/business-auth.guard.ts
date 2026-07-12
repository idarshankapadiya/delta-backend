import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getClientIp } from '../security/request-context';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthService } from './business-auth.service';
import type { BusinessAuthRequest } from './business-auth.types';
import { getBusinessSessionToken } from './business-session-cookie';

@Injectable()
export class BusinessAuthGuard implements CanActivate {
  constructor(
    private readonly businessAuthService: BusinessAuthService,
    private readonly audit: SecurityAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    try {
      const grant = await this.businessAuthService.restoreSession(
        getBusinessSessionToken(request),
      );
      (request as BusinessAuthRequest).businessSession = grant.session;
      return true;
    } catch (error) {
      this.audit.record({
        action: 'business_request_auth',
        outcome: 'denied',
        ip: getClientIp(request),
        path: request.url,
        reason:
          error instanceof Error ? error.message : 'authentication_failed',
      });
      throw error;
    }
  }
}
