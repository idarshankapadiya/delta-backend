import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { OrderInventoryParamsDto } from '../inventory/dto/inventory.dto';
import { OrderService } from '../order/order.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business/orders')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Orders')
@ApiCookieAuth('businessSession')
export class BusinessOrderController {
  constructor(
    private readonly orders: OrderService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
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

  @Post(':orderId/confirm')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({
    summary: 'Confirm an order and reserve available stock',
    description:
      'Idempotently reserves every line item. Insufficient availability moves the order to pending_stock and returns 409.',
  })
  @ApiOkResponse({ description: 'Order confirmed and stock reserved.' })
  @ApiConflictResponse({
    description: 'Insufficient stock or invalid order state.',
  })
  @ApiNotFoundResponse({ description: 'Order or product not found.' })
  confirm(
    @Param() params: OrderInventoryParamsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.fulfill(request, 'customer_order_confirm', () =>
      this.orders.confirmOrder(params.orderId, this.actor(request)),
    );
  }

  @Post(':orderId/dispatch')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({ summary: 'Dispatch an order and consume its reserved stock' })
  @ApiOkResponse({ description: 'Order dispatched and on-hand stock reduced.' })
  @ApiConflictResponse({ description: 'Order is not confirmed.' })
  dispatch(
    @Param() params: OrderInventoryParamsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.fulfill(request, 'customer_order_dispatch', () =>
      this.orders.dispatchOrder(params.orderId, this.actor(request)),
    );
  }

  @Post(':orderId/cancel')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({ summary: 'Cancel an order and release any reservation' })
  @ApiOkResponse({
    description: 'Order cancelled and reserved stock released.',
  })
  @ApiConflictResponse({
    description: 'Dispatched or returned order cannot be cancelled.',
  })
  cancel(
    @Param() params: OrderInventoryParamsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.fulfill(request, 'customer_order_cancel', () =>
      this.orders.cancelOrder(params.orderId, this.actor(request)),
    );
  }

  @Post(':orderId/return')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({
    summary: 'Return all order items to sellable stock',
    description: 'Use only after returned goods have passed inspection.',
  })
  @ApiOkResponse({ description: 'Order returned and on-hand stock restored.' })
  @ApiConflictResponse({ description: 'Order has not been dispatched.' })
  returnOrder(
    @Param() params: OrderInventoryParamsDto,
    @Req() request: FastifyRequest,
  ) {
    return this.fulfill(request, 'customer_order_return', () =>
      this.orders.returnOrder(params.orderId, this.actor(request)),
    );
  }

  private actor(request: FastifyRequest): string {
    const session = (request as BusinessAuthRequest).businessSession;
    return session?.email || session?.subject || 'business-admin';
  }

  private async fulfill<T>(
    request: FastifyRequest,
    action: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = await operation();
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action,
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
    return result;
  }
}
