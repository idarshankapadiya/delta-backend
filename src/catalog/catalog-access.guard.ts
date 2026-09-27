import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import {
  CatalogAccessService,
  type CatalogAccessSessionSummary,
} from './catalog-access.service';

export const catalogAccessCookieName = 'catalog_access';

export interface CatalogAuthenticatedRequest extends FastifyRequest {
  catalogSession: CatalogAccessSessionSummary;
}

@Injectable()
export class CatalogAccessGuard implements CanActivate {
  constructor(private readonly catalogAccessService: CatalogAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = request.cookies?.[catalogAccessCookieName];

    const session = token
      ? await this.catalogAccessService.getAccessSession(token)
      : null;

    if (!session) {
      throw new UnauthorizedException('Catalog access is required');
    }

    (request as CatalogAuthenticatedRequest).catalogSession = session;
    return true;
  }
}
