import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CatalogVerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  challenge_id: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(6)
  @Matches(/^\d{6}$/)
  code!: string;
}
