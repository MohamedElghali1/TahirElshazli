import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';

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
  // The same guard the submission fileUrl uses, rather than class-validator's
  // @IsUrl(): that accepts ftp: and any private host, and this value is handed
  // straight to an <img src> in the browser and may later be fetched
  // server-side for thumbnailing. One rule for client-supplied URLs, not two.
  @IsPublicHttpUrl()
  @MaxLength(2048)
  avatarUrl?: string | null;
}
