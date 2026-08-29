import {
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @Matches(/^\+?[0-9 ()-]{6,20}$/, { message: 'phone must be a valid phone number' })
  phone?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsUrl()
  avatarUrl?: string | null;
}
