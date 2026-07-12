import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';

@Injectable()
export class ServiceBoundaryGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.INTERNAL_ADMIN_SERVICE_ONLY !== 'true') {
      return true;
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const path = request.url.split('?')[0];

    if (path === '/api/health' || path.startsWith('/api/internal/')) {
      return true;
    }

    throw new NotFoundException('Not found');
  }
}
