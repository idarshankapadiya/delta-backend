import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class BusinessGoogleAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  id_token: string;
}
