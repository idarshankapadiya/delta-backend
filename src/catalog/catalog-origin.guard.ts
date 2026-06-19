import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { getAllowedFrontendOrigins } from '../config/http.config';

@Injectable()
export class CatalogOriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const origin = request.headers.origin as string | string[] | undefined;

    if (!origin) {
      return true;
    }

    if (Array.isArray(origin)) {
      return origin.every((value) => this.isAllowedOrigin(value));
    }

    if (this.isAllowedOrigin(origin)) {
      return true;
    }

    throw new ForbiddenException('Origin is not allowed');
  }

  private isAllowedOrigin(origin: string): boolean {
    return this.getAllowedOrigins().includes(origin);
  }

  private getAllowedOrigins(): string[] {
    return getAllowedFrontendOrigins();
  }
}
