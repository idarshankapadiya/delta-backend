import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getClientIp } from '../security/request-context';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthService } from './business-auth.service';
import { getBusinessSessionToken } from './business-session-cookie';

@Injectable()
export class BusinessCsrfGuard implements CanActivate {
  constructor(
    private readonly businessAuthService: BusinessAuthService,
    private readonly audit: SecurityAuditService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const csrfHeader = request.headers['x-csrf-token'];
    const csrfToken = Array.isArray(csrfHeader) ? csrfHeader[0] : csrfHeader;

    try {
      this.businessAuthService.validateCsrf(
        getBusinessSessionToken(request),
        csrfToken,
      );
      return true;
    } catch (error) {
      this.audit.record({
        action: 'business_request_csrf',
        outcome: 'denied',
        ip: getClientIp(request),
        path: request.url,
        reason: error instanceof Error ? error.message : 'csrf_failed',
      });
      throw error;
    }
  }
}
