import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class CatalogLibraryDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  company_slugs: string[];
}
