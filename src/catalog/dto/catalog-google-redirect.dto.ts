import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CatalogGoogleRedirectDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  credential: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  g_csrf_token: string;
}
