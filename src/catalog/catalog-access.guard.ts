import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CatalogAccessService } from './catalog-access.service';

export const catalogAccessCookieName = 'catalog_access';

@Injectable()
export class CatalogAccessGuard implements CanActivate {
  constructor(private readonly catalogAccessService: CatalogAccessService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies?.[catalogAccessCookieName];

    if (!token || !this.catalogAccessService.validateAccessToken(token)) {
      throw new UnauthorizedException('Catalog access is required');
    }

    return true;
  }
}
