import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import type { ProductSort, ProductStockFilter } from '../product.types';

const productSortValues = [
  'name_asc',
  'name_desc',
  'price_asc',
  'price_desc',
] as const;
const productStockValues = ['in_stock', 'out_of_stock'] as const;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;

export class ListProductsDto {
  @IsOptional()
  @IsString()
  @Matches(idPattern)
  companyId?: string;

  @IsOptional()
  @IsString()
  @Matches(idPattern)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Matches(idPattern)
  subcategoryId?: string;

  @IsOptional()
  @IsEnum(productStockValues)
  stock?: ProductStockFilter;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(productSortValues)
  sort: ProductSort = 'name_asc';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 30;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  cursor?: string;
}

export class ListCategoriesDto {
  @IsOptional()
  @IsString()
  @Matches(idPattern)
  companyId?: string;
}

export class ProductParamsDto {
  @IsString()
  @Matches(idPattern)
  productId: string;
}
