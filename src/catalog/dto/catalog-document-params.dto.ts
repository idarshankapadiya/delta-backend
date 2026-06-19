import { IsNotEmpty, IsString } from 'class-validator';

export class CatalogDocumentParamsDto {
  @IsString()
  @IsNotEmpty()
  document_id: string;
}
