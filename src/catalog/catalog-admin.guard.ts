import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class CatalogAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expectedToken = process.env.BACKEND_ADMIN_TOKEN?.trim();

    if (!expectedToken) {
      throw new ServiceUnavailableException('BACKEND_ADMIN_TOKEN is required');
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const suppliedToken = this.getHeaderValue(
      request.headers['x-backend-admin-token'],
    );

    if (!suppliedToken || !this.isSameToken(suppliedToken, expectedToken)) {
      throw new UnauthorizedException('Catalog admin token is required');
    }

    return true;
  }

  private getHeaderValue(value: string | string[] | undefined): string | null {
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return value ?? null;
  }

  private isSameToken(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    if (leftBuffer.length !== rightBuffer.length) {
      return false;
    }

    return timingSafeEqual(leftBuffer, rightBuffer);
  }
}
