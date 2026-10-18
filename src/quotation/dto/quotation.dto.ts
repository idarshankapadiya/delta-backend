import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { QuotationStatus } from '../quotation.types';

const productIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const quotationIdPattern = /^QUO-[0-9A-HJKMNP-TV-Z]{26}$/;
const quotationStatuses = [
  'new',
  'reviewing',
  'quoted',
  'closed',
  'cancelled',
] as const;

export class QuotationCartItemDto {
  @IsString()
  @Matches(productIdPattern)
  productId: string;

  @IsInt()
  @Min(1)
  @Max(999)
  quantity: number;
}

export class ValidateCartDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => QuotationCartItemDto)
  items: QuotationCartItemDto[];
}

export class QuotationCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @IsEmail()
  @MaxLength(160)
  email: string;

  @IsString()
  @Matches(/^\d{10}$/)
  mobile: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  deliveryLocation: string;
}

export class CreateQuotationRequestDto extends ValidateCartDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captcha_token?: string;

  @ValidateNested()
  @Type(() => QuotationCustomerDto)
  customer: QuotationCustomerDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class QuotationParamsDto {
  @IsString()
  @Matches(quotationIdPattern)
  quotationId: string;
}

export class UpdateQuotationStatusDto {
  @IsEnum(quotationStatuses)
  status: QuotationStatus;
}
