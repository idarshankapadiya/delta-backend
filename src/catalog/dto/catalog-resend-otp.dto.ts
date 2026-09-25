import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CatalogResendOtpDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  challenge_id!: string;
}
