import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DocumentAccessDto {
  @IsString()
  @IsNotEmpty()
  company_slug: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category_slug?: string;

  @IsString()
  @IsNotEmpty()
  document_slug: string;

  @IsIn(['preview', 'download'])
  action: 'preview' | 'download';
}
