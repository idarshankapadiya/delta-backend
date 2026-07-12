import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CatalogAdminGuard } from '../catalog/catalog-admin.guard';

@Injectable()
export class InternalAdminGuard implements CanActivate {
  constructor(private readonly catalogAdminGuard: CatalogAdminGuard) {}

  canActivate(context: ExecutionContext): boolean {
    if (process.env.INTERNAL_ADMIN_API_ENABLED !== 'true') {
      throw new NotFoundException('Not found');
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    if (request.headers.origin) {
      throw new ForbiddenException('Browser origins are not allowed');
    }

    return this.catalogAdminGuard.canActivate(context);
  }
}
