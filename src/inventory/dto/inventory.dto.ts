import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { productResourceIdPattern } from '../../product/dto/product-mutation.dto';

export class InventoryProductParamsDto {
  @ApiProperty()
  @IsString()
  @Matches(productResourceIdPattern)
  productId: string;
}

export class InventoryMovementQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  productId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 500, default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ReceiveStockDto {
  @ApiProperty()
  @IsString()
  @Matches(productResourceIdPattern)
  productId: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  @ApiProperty({ example: 'PO-2026-0042' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  referenceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class AdjustStockDto {
  @ApiProperty({ description: 'Signed on-hand quantity change.', example: -2 })
  @Type(() => Number)
  @IsInt()
  @NotEquals(0)
  quantityDelta: number;

  @ApiProperty({ enum: ['DAMAGE', 'MANUAL_ADJUSTMENT'] })
  @IsIn(['DAMAGE', 'MANUAL_ADJUSTMENT'])
  type: 'DAMAGE' | 'MANUAL_ADJUSTMENT';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class StockCountDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateInventorySettingsDto {
  @ApiProperty({ minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  reorderLevel: number;
}

export class OrderInventoryParamsDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  orderId: string;
}

export class InventoryReferenceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;
}

export class InventoryItemResponseDto {
  @ApiProperty()
  productId: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  sku?: string;

  @ApiPropertyOptional()
  modelNumber?: string;

  @ApiProperty({ type: InventoryReferenceDto })
  company: InventoryReferenceDto;

  @ApiProperty({ type: InventoryReferenceDto })
  category: InventoryReferenceDto;

  @ApiProperty({ minimum: 0 })
  onHandQuantity: number;

  @ApiProperty({ minimum: 0 })
  reservedQuantity: number;

  @ApiProperty({ minimum: 0 })
  availableQuantity: number;

  @ApiProperty({ minimum: 0 })
  incomingQuantity: number;

  @ApiProperty({ minimum: 0 })
  damagedQuantity: number;

  @ApiProperty({ minimum: 0 })
  reorderLevel: number;

  @ApiProperty({ enum: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'] })
  status: 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}

export class InventoryListResponseDto {
  @ApiProperty({ type: InventoryItemResponseDto, isArray: true })
  data: InventoryItemResponseDto[];
}

export class InventoryMovementResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  productId: string;

  @ApiProperty({
    enum: [
      'OPENING_BALANCE',
      'PURCHASE_RECEIPT',
      'ORDER_RESERVATION',
      'RESERVATION_RELEASE',
      'ORDER_DISPATCH',
      'CUSTOMER_RETURN',
      'DAMAGE',
      'MANUAL_ADJUSTMENT',
      'STOCK_COUNT',
    ],
  })
  type: string;

  @ApiProperty()
  quantityDelta: number;

  @ApiProperty({ minimum: 0 })
  onHandBefore: number;

  @ApiProperty({ minimum: 0 })
  onHandAfter: number;

  @ApiProperty({ minimum: 0 })
  reservedBefore: number;

  @ApiProperty({ minimum: 0 })
  reservedAfter: number;

  @ApiPropertyOptional()
  referenceType?: string;

  @ApiPropertyOptional()
  referenceId?: string;

  @ApiProperty()
  reason: string;

  @ApiPropertyOptional()
  notes?: string;

  @ApiProperty()
  createdBy: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class InventoryMovementListResponseDto {
  @ApiProperty({ type: InventoryMovementResponseDto, isArray: true })
  data: InventoryMovementResponseDto[];
}
