import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CatalogVerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  challenge_id: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  mobile?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(12)
  otp: string;
}
