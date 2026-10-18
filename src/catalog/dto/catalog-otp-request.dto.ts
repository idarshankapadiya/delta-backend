import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CatalogOtpRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  identifier!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  captcha_token?: string;
}
