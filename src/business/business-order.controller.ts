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
import { OrderService } from '../order/order.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';

@Controller('business/orders')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Orders')
export class BusinessOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
  @ApiCookieAuth('businessSession')
  @ApiOperation({ summary: 'List placed customer orders newest first' })
  @ApiOkResponse({ description: 'Up to 200 latest placed customer orders.' })
  async getOrders(@Req() request: FastifyRequest) {
    const response = await this.orders.getOrders();
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action: 'customer_orders_read',
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
    return response;
  }
}
