import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CatalogOtpRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;

  @IsIn(['whatsapp', 'email'])
  channel: 'whatsapp' | 'email';

  @IsOptional()
  @IsString()
  @MaxLength(12)
  otp?: string;
}
