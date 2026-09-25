import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CatalogFirebaseAccessDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  id_token!: string;
}
