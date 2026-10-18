import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerOrderLineItemDto {
  @ApiProperty()
  product_id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  sku?: string;

  @ApiPropertyOptional()
  model_number?: string;

  @ApiProperty({ minimum: 1 })
  quantity: number;

  @ApiProperty({ minimum: 0 })
  unit_price: number;

  @ApiProperty({ minimum: 0 })
  line_total: number;

  @ApiProperty({ example: 'INR' })
  currency: string;
}

export class CustomerOrderTotalDto {
  @ApiProperty({ minimum: 0 })
  subtotal: number;

  @ApiProperty({ minimum: 0 })
  shipping: number;

  @ApiProperty({ minimum: 0 })
  total: number;
}

export class CustomerOrderDto {
  @ApiProperty({ format: 'uuid' })
  order_id: string;

  @ApiProperty({ example: 'DE-01K5ABCDEF1234567890' })
  reference: string;

  @ApiProperty({ example: 'placed' })
  status: string;

  @ApiProperty({ example: 'pending' })
  payment_status: string;

  @ApiProperty({ type: CustomerOrderLineItemDto, isArray: true })
  items: CustomerOrderLineItemDto[];

  @ApiProperty({ minimum: 0, description: 'Sum of all ordered quantities.' })
  item_count: number;

  @ApiProperty({
    type: 'object',
    description: 'Order totals keyed by ISO 4217 currency code.',
    additionalProperties: {
      type: 'object',
      properties: {
        subtotal: { type: 'number', minimum: 0 },
        shipping: { type: 'number', minimum: 0 },
        total: { type: 'number', minimum: 0 },
      },
      required: ['subtotal', 'shipping', 'total'],
    },
    example: {
      INR: { subtotal: 1200, shipping: 300, total: 1500 },
    },
  })
  totals: Record<string, CustomerOrderTotalDto>;

  @ApiProperty({ format: 'date-time' })
  created_at: string;

  @ApiProperty({ format: 'date-time' })
  updated_at: string;
}

export class CustomerOrdersResponseDto {
  @ApiProperty({ type: CustomerOrderDto, isArray: true })
  orders: CustomerOrderDto[];
}
