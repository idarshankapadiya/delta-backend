import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  AdjustStockDto,
  InventoryMovementQueryDto,
  InventoryItemResponseDto,
  InventoryListResponseDto,
  InventoryMovementListResponseDto,
  InventoryProductParamsDto,
  ReceiveStockDto,
  StockCountDto,
  UpdateInventorySettingsDto,
} from '../inventory/dto/inventory.dto';
import { InventoryService } from '../inventory/inventory.service';
import { NoStoreInterceptor } from '../security/no-store.interceptor';
import { BusinessSiteOriginGuard } from '../security/origin.guards';
import { SecurityAuditService } from '../security/security-audit.service';
import { BusinessAuthGuard } from './business-auth.guard';
import type { BusinessAuthRequest } from './business-auth.types';
import { BusinessCsrfGuard } from './business-csrf.guard';

@Controller('business/inventory')
@UseGuards(BusinessSiteOriginGuard, BusinessAuthGuard)
@UseInterceptors(NoStoreInterceptor)
@ApiTags('Business Inventory')
@ApiCookieAuth('businessSession')
export class BusinessInventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly audit: SecurityAuditService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List inventory for active products',
    description:
      'Returns on-hand, reserved, available, incoming, damaged and reorder quantities. Legacy product stock is used until its first ledger mutation.',
  })
  @ApiOkResponse({
    description: 'Inventory sorted by product name.',
    type: InventoryListResponseDto,
  })
  getInventory() {
    return this.inventory.listInventory();
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'List low-stock and out-of-stock products' })
  @ApiOkResponse({
    description: 'Products at or below their reorder level.',
    type: InventoryListResponseDto,
  })
  getLowStock() {
    return this.inventory.listInventory(true);
  }

  @Get('movements')
  @ApiOperation({ summary: 'List immutable stock movement history' })
  @ApiOkResponse({
    description: 'Newest stock movements first.',
    type: InventoryMovementListResponseDto,
  })
  getMovements(@Query() query: InventoryMovementQueryDto) {
    return this.inventory.listMovements(query.productId, query.limit ?? 100);
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get inventory for one product' })
  @ApiNotFoundResponse({ description: 'Product not found.' })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  getProductInventory(@Param() params: InventoryProductParamsDto) {
    return this.inventory.getInventory(params.productId);
  }

  @Post('receipts')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({
    summary: 'Receive purchased stock',
    description:
      'Atomically increases on-hand stock, updates public availability, and appends a purchase receipt movement.',
  })
  @ApiConflictResponse({ description: 'The resulting stock state is invalid.' })
  @ApiCreatedResponse({ type: InventoryItemResponseDto })
  async receive(@Body() body: ReceiveStockDto, @Req() request: FastifyRequest) {
    const result = await this.inventory.receive(body, this.actor(request));
    this.auditMutation(request, 'inventory_purchase_receipt');
    return result;
  }

  @Post(':productId/adjustments')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({
    summary: 'Adjust stock with a mandatory reason',
    description:
      'Applies a signed manual or damage adjustment and records the before/after quantities in the immutable ledger.',
  })
  @ApiConflictResponse({ description: 'Adjustment would make stock negative.' })
  @ApiCreatedResponse({ type: InventoryItemResponseDto })
  async adjust(
    @Param() params: InventoryProductParamsDto,
    @Body() body: AdjustStockDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.inventory.adjust(
      params.productId,
      body,
      this.actor(request),
    );
    this.auditMutation(request, 'inventory_adjustment');
    return result;
  }

  @Post(':productId/stock-counts')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({ summary: 'Reconcile stock to a physical count' })
  @ApiConflictResponse({
    description: 'Count is below already reserved stock.',
  })
  @ApiCreatedResponse({ type: InventoryItemResponseDto })
  async count(
    @Param() params: InventoryProductParamsDto,
    @Body() body: StockCountDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.inventory.count(
      params.productId,
      body,
      this.actor(request),
    );
    this.auditMutation(request, 'inventory_stock_count');
    return result;
  }

  @Put(':productId/settings')
  @UseGuards(BusinessCsrfGuard)
  @ApiSecurity('csrfToken')
  @ApiOperation({ summary: 'Set the product reorder level' })
  @ApiOkResponse({ type: InventoryItemResponseDto })
  async updateSettings(
    @Param() params: InventoryProductParamsDto,
    @Body() body: UpdateInventorySettingsDto,
    @Req() request: FastifyRequest,
  ) {
    const result = await this.inventory.updateReorderLevel(
      params.productId,
      body.reorderLevel,
      this.actor(request),
    );
    this.auditMutation(request, 'inventory_settings_update');
    return result;
  }

  private actor(request: FastifyRequest): string {
    const session = (request as BusinessAuthRequest).businessSession;
    return session?.email || session?.subject || 'business-admin';
  }

  private auditMutation(request: FastifyRequest, action: string) {
    const session = (request as BusinessAuthRequest).businessSession;
    this.audit.record({
      action,
      outcome: 'allowed',
      email: session?.email,
      path: request.url,
      subject: session?.subject,
    });
  }
}
