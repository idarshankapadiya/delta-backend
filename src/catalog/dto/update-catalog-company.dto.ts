import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateCatalogCompanyDto {
  @IsString()
  @IsNotEmpty()
  company_name: string;
}
