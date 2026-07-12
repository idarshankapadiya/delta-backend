import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  getBusinessSiteOrigins,
  getPublicSiteOrigins,
} from '../config/origin.config';

function getRequestOrigin(request: FastifyRequest): string | undefined {
  const origin: unknown = request.headers.origin;

  if (typeof origin === 'string') {
    return origin;
  }

  return Array.isArray(origin) && typeof origin[0] === 'string'
    ? origin[0]
    : undefined;
}

@Injectable()
export class PublicSiteOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const origin = getRequestOrigin(request);

    if (origin && getPublicSiteOrigins().includes(origin)) {
      return true;
    }

    throw new ForbiddenException('Public UI origin is required');
  }
}

@Injectable()
export class BusinessSiteOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const origin = getRequestOrigin(request);

    if (origin && getBusinessSiteOrigins().includes(origin)) {
      return true;
    }

    throw new ForbiddenException('Business UI origin is required');
  }
}
