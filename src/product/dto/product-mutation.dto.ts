import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const productResourceIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/;
const currencyPattern = /^[A-Z]{3}$/;

export class ProductResourceParamsDto {
  @IsString()
  @Matches(productResourceIdPattern)
  productId: string;
}

export class ProductCompanyParamsDto {
  @IsString()
  @Matches(productResourceIdPattern)
  companyId: string;
}

export class ProductCategoryParamsDto {
  @IsString()
  @Matches(productResourceIdPattern)
  categoryId: string;
}

export class CreateProductCompanyDto {
  @IsString()
  @Matches(productResourceIdPattern)
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  logoPath?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateProductCompanyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  logoPath?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateProductCategoryDto {
  @IsString()
  @Matches(productResourceIdPattern)
  id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  slug?: string;

  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @Matches(productResourceIdPattern, { each: true })
  companyIds: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateProductCategoryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  slug?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  @Matches(productResourceIdPattern, { each: true })
  companyIds?: string[];

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateProductDto {
  @IsString()
  @Matches(productResourceIdPattern)
  productId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  modelNumber?: string;

  @IsString()
  @Matches(productResourceIdPattern)
  companyId: string;

  @IsString()
  @Matches(productResourceIdPattern)
  categoryId: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subcategoryName?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  subcategorySlug?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @IsString()
  @Matches(currencyPattern)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @IsBoolean()
  inStock: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, string | number | boolean | null>;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  thumbnailPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  mainImagePath?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  additionalImagePaths?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  brochurePath?: string;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(240)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  modelNumber?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  companyId?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  subcategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subcategoryName?: string;

  @IsOptional()
  @IsString()
  @Matches(productResourceIdPattern)
  subcategorySlug?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @IsOptional()
  @IsString()
  @Matches(currencyPattern)
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  discountPercentage?: number;

  @IsOptional()
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20000)
  description?: string;

  @IsOptional()
  @IsObject()
  specifications?: Record<string, string | number | boolean | null>;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  thumbnailPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  mainImagePath?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(1024, { each: true })
  additionalImagePaths?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  brochurePath?: string;
}
