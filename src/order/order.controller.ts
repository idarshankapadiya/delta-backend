import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  CatalogAccessGuard,
  type CatalogAuthenticatedRequest,
} from '../catalog/catalog-access.guard';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { PublicSiteOriginGuard } from '../security/origin.guards';
import { CreateOrderDto, CreateOrderResponseDto } from './dto/create-order.dto';
import { CustomerOrdersResponseDto } from './dto/customer-order.dto';
import { OrderService } from './order.service';

@Controller('orders')
@ApiTags('Customer Orders')
@ApiCookieAuth('catalogAccess')
@ApiUnauthorizedResponse({ description: 'Catalog access is required.' })
@UseGuards(PublicSiteOriginGuard, CatalogAccessGuard)
@UseInterceptors(NoStoreInterceptor)
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Get()
  @ApiOperation({
    summary: "List the authenticated customer's orders",
    description:
      'Returns only orders owned by the customer in the authenticated catalog session, newest first. The customer header is a race-condition guard and never selects ownership.',
  })
  @ApiHeader({
    name: 'X-Expected-Customer-Id',
    required: true,
    description: 'Must equal the customer in the authenticated session.',
  })
  @ApiOkResponse({
    type: CustomerOrdersResponseDto,
    description: 'Up to 100 orders owned by the authenticated customer.',
  })
  @ApiConflictResponse({ description: 'The authenticated customer changed.' })
  getOrders(@Req() request: CatalogAuthenticatedRequest) {
    const rawExpectedCustomerId = request.headers['x-expected-customer-id'];
    const expectedCustomerId = Array.isArray(rawExpectedCustomerId)
      ? rawExpectedCustomerId[0]
      : rawExpectedCustomerId;
    if (!expectedCustomerId) {
      throw new ConflictException(
        'The authenticated customer changed before the order request was processed.',
      );
    }
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.orders.getCustomerOrders(customerId);
  }

  @Post()
  @ApiOperation({
    summary: "Place the authenticated customer's order",
    description:
      'Snapshots validated cart pricing into Firestore, records payment as pending, and clears the cart. orderRequestId makes retries idempotent. VITE_DISCOUNTS_ENABLED=false on the backend disables product discounts and uses original product prices; true or unset applies catalog discounts. Saved snapshots record the applied discount (zero when disabled). Existing snapshots are not repriced. Shipping is added separately. Client prices and discount flags are never accepted.',
  })
  @ApiHeader({
    name: 'X-Expected-Customer-Id',
    required: true,
    description: 'Must equal the customer in the authenticated session.',
  })
  @ApiCreatedResponse({ type: CreateOrderResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid checkout details or empty cart.',
  })
  @ApiConflictResponse({ description: 'The authenticated customer changed.' })
  createOrder(
    @Req() request: CatalogAuthenticatedRequest,
    @Headers('x-expected-customer-id') expectedCustomerId: string | undefined,
    @Body() body: CreateOrderDto,
  ) {
    if (!expectedCustomerId) {
      throw new ConflictException(
        'The authenticated customer changed before the order was placed.',
      );
    }
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.orders.createOrder(customerId, body);
  }

  private getCustomerId(
    request: CatalogAuthenticatedRequest,
    expectedCustomerId?: string,
  ): string {
    const customerId = request.catalogSession.customerId;
    if (expectedCustomerId && expectedCustomerId !== customerId) {
      throw new ConflictException(
        'The authenticated customer changed before the order request was processed.',
      );
    }
    return customerId;
  }
}
