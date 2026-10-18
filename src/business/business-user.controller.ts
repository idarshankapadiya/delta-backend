import {
  Controller,
  Get,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { CatalogAccessService } from '../catalog/catalog-access.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';

@Controller('business/users')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Users')
export class BusinessUserController {
  constructor(
    private readonly catalogAccess: CatalogAccessService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'List catalog users by latest login' })
  @ApiOkResponse({
    description: 'Up to 500 catalog users, newest login first.',
    schema: {
      type: 'object',
      required: ['users'],
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            required: [
              'customer_id',
              'email',
              'mobile',
              'name',
              'profile_complete',
              'created_at',
              'last_login_at',
            ],
            properties: {
              customer_id: { type: 'string' },
              email: { type: 'string', nullable: true },
              mobile: { type: 'string', nullable: true },
              name: { type: 'string' },
              profile_complete: { type: 'boolean' },
              created_at: { type: 'string', format: 'date-time' },
              last_login_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
  })
  async getUsers(@Req() request: FastifyRequest) {
    const response = await this.catalogAccess.listCustomers();
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action: 'catalog_users_read',
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
    return response;
  }
}
