import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

const productIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export class CartItemParamsDto {
  @ApiProperty({ example: 'compact-nsx-100' })
  @IsString()
  @Matches(productIdPattern)
  productId: string;
}

export class SetCartItemDto {
  @ApiProperty({ minimum: 1, maximum: 999, example: 2 })
  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

export class MergeCartItemDto extends SetCartItemDto {
  @ApiProperty({ example: 'compact-nsx-100' })
  @IsString()
  @Matches(productIdPattern)
  productId: string;
}

export class MergeCartDto {
  @ApiProperty({ enum: ['maximum_quantity'], example: 'maximum_quantity' })
  @IsIn(['maximum_quantity'])
  strategy: 'maximum_quantity';

  @ApiProperty({ type: () => [MergeCartItemDto], maxItems: 50 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MergeCartItemDto)
  items: MergeCartItemDto[];
}

export class CartProductReferenceDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;
}

export class CartProductDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ required: false })
  sku?: string;

  @ApiProperty({ required: false })
  modelNumber?: string;

  @ApiProperty({ type: CartProductReferenceDto })
  company: CartProductReferenceDto;

  @ApiProperty({ type: CartProductReferenceDto })
  category: CartProductReferenceDto;

  @ApiProperty({ example: 100 })
  price: number;

  @ApiProperty({ example: 'INR' })
  currency: string;

  @ApiProperty({ example: 10 })
  discountPercentage: number;

  @ApiProperty()
  inStock: boolean;

  @ApiProperty({ required: false, minimum: 0 })
  stockQuantity?: number;

  @ApiProperty({ required: false })
  thumbnailUrl?: string;
}

export class CustomerCartItemDto {
  @ApiProperty()
  productId: string;

  @ApiProperty({ minimum: 1, maximum: 999 })
  quantity: number;

  @ApiProperty({ type: CartProductDto })
  product: CartProductDto;
}

export class CustomerCartResponseDto {
  @ApiProperty()
  customer_id: string;

  @ApiProperty({ type: () => [CustomerCartItemDto] })
  items: CustomerCartItemDto[];
}
