import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CatalogGoogleAccessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  id_token: string;
}
