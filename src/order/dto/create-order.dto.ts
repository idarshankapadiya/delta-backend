import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OrderAddressDto {
  @ApiProperty({ example: 'Ankita' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName: string;

  @ApiProperty({ example: 'Patel' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @ApiProperty({ required: false, example: '27ABCDE1234F1Z5' })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9A-Z]{15}$/)
  gstNumber?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  addressLine1: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(250)
  addressLine2?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state: string;

  @ApiProperty({ example: '411001' })
  @IsString()
  @Matches(/^\d{6}$/)
  postcode: string;

  @ApiProperty({ example: '9876543210' })
  @IsString()
  @Matches(/^\d{10}$/)
  phone: string;
}

export class CreateOrderDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  orderRequestId: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiProperty({ type: OrderAddressDto })
  @ValidateNested()
  @Type(() => OrderAddressDto)
  billingAddress: OrderAddressDto;

  @ApiProperty({ type: OrderAddressDto, required: false })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderAddressDto)
  shippingAddress?: OrderAddressDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  termsAccepted: boolean;
}

export class CreateOrderResponseDto {
  @ApiProperty({ example: true })
  ok: true;

  @ApiProperty()
  order_id: string;

  @ApiProperty({ example: 'DE-01K5ABCDEF1234567890' })
  reference: string;

  @ApiProperty({ example: 'placed' })
  status: string;

  @ApiProperty({ example: 'pending' })
  payment_status: string;

  @ApiProperty({ format: 'date-time' })
  created_at: string;
}
