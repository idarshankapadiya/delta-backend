import {
  Body,
  ConflictException,
  Controller,
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
import { OrderService } from './order.service';

@Controller('orders')
@ApiTags('Customer Orders')
@ApiCookieAuth('catalogAccess')
@ApiUnauthorizedResponse({ description: 'Catalog access is required.' })
@UseGuards(PublicSiteOriginGuard, CatalogAccessGuard)
@UseInterceptors(NoStoreInterceptor)
export class OrderController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @ApiOperation({
    summary: "Place the authenticated customer's order",
    description:
      'Snapshots validated cart pricing into Firestore, records payment as pending, and clears the cart. orderRequestId makes retries idempotent.',
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
    const customerId = request.catalogSession.customerId;
    if (!expectedCustomerId || expectedCustomerId !== customerId) {
      throw new ConflictException(
        'The authenticated customer changed before the order was placed.',
      );
    }
    return this.orders.createOrder(customerId, body);
  }
}
