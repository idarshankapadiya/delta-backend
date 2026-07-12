import { IsNotEmpty, IsString } from 'class-validator';

export class CatalogCompanyParamsDto {
  @IsString()
  @IsNotEmpty()
  company_slug: string;
}
