import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiHeader,
  ApiNotFoundResponse,
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
import { CartService } from './cart.service';
import {
  CartItemParamsDto,
  CustomerCartResponseDto,
  MergeCartDto,
  SetCartItemDto,
} from './dto/cart.dto';

@Controller('cart')
@ApiTags('Customer Cart')
@ApiCookieAuth('catalogAccess')
@ApiHeader({
  name: 'X-Expected-Customer-Id',
  required: false,
  description:
    'Optional race-condition guard. When provided, it must equal the customer in the authenticated session; it never selects cart ownership.',
})
@ApiUnauthorizedResponse({ description: 'Catalog access is required.' })
@UseGuards(PublicSiteOriginGuard, CatalogAccessGuard)
@UseInterceptors(NoStoreInterceptor)
export class CartController {
  constructor(private readonly carts: CartService) {}

  @Get()
  @ApiOperation({ summary: "Get the authenticated customer's cart" })
  @ApiOkResponse({ type: CustomerCartResponseDto })
  getCart(
    @Req() request: CatalogAuthenticatedRequest,
    @Headers('x-expected-customer-id') expectedCustomerId?: string,
  ) {
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.carts.getCart(customerId);
  }

  @Put('items/:productId')
  @ApiOperation({
    summary: 'Set the absolute quantity of one cart product',
    description:
      'Validates the active product and stock, clamps quantity to the available stock limit, and returns the complete normalized cart.',
  })
  @ApiOkResponse({ type: CustomerCartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid product ID or quantity.' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiConflictResponse({
    description: 'Product is unavailable or the cart item limit was reached.',
  })
  setItem(
    @Req() request: CatalogAuthenticatedRequest,
    @Headers('x-expected-customer-id') expectedCustomerId: string | undefined,
    @Param() params: CartItemParamsDto,
    @Body() body: SetCartItemDto,
  ) {
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.carts.setItem(customerId, params.productId, body.quantity);
  }

  @Delete('items/:productId')
  @ApiOperation({ summary: 'Remove one product from the cart' })
  @ApiOkResponse({ type: CustomerCartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid product ID.' })
  removeItem(
    @Req() request: CatalogAuthenticatedRequest,
    @Headers('x-expected-customer-id') expectedCustomerId: string | undefined,
    @Param() params: CartItemParamsDto,
  ) {
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.carts.removeItem(customerId, params.productId);
  }

  @Delete()
  @ApiOperation({ summary: "Clear the authenticated customer's cart" })
  @ApiOkResponse({ type: CustomerCartResponseDto })
  clearCart(
    @Req() request: CatalogAuthenticatedRequest,
    @Headers('x-expected-customer-id') expectedCustomerId?: string,
  ) {
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.carts.clearCart(customerId);
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Merge a pre-login anonymous cart into the customer cart',
    description:
      'Uses maximum_quantity semantics, making retries and simultaneous tab submissions idempotent.',
  })
  @ApiOkResponse({ type: CustomerCartResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid merge request.' })
  @ApiNotFoundResponse({ description: 'One or more products were not found.' })
  @ApiConflictResponse({
    description:
      'A product is unavailable, the customer guard mismatched, or the cart item limit was reached.',
  })
  mergeCart(
    @Req() request: CatalogAuthenticatedRequest,
    @Headers('x-expected-customer-id') expectedCustomerId: string | undefined,
    @Body() body: MergeCartDto,
  ) {
    const customerId = this.getCustomerId(request, expectedCustomerId);
    return this.carts.mergeCart(customerId, body.items);
  }

  private getCustomerId(
    request: CatalogAuthenticatedRequest,
    expectedCustomerId?: string,
  ): string {
    const customerId = request.catalogSession.customerId;
    if (expectedCustomerId && expectedCustomerId !== customerId) {
      throw new ConflictException(
        'The authenticated customer changed before the cart request was processed.',
      );
    }
    return customerId;
  }
}
