import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';
import { IsPublicHttpUrl } from '../../common/validators/is-public-http-url.validator.js';

/**
 * The staff-facing edit (`PEOPLE-2`) - every field `AdminStudentProfileUpdate`
 * carries, unlike the student's own `UpdateProfileDto`. `name` maps to a
 * `NOT NULL` column (`@IsOptionalNotNull`); every other field is nullable and
 * `null` means "clear it" (`@IsOptional` + `@ValidateIf`), same convention as
 * `UpdateProfileDto`.
 */
export class AdminUpdateStudentDto {
  @IsOptionalNotNull()
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
  @IsPublicHttpUrl()
  @MaxLength(2048)
  avatarUrl?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(200)
  schoolName?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsEmail()
  @MaxLength(254)
  parentEmail?: string | null;

  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(2000)
  staffNotes?: string | null;
}

/**
 * Creating a student directly (`PEOPLE-3`). No password - the account is
 * mailed a sign-in link and sets one via the existing password-reset flow.
 */
export class CreateStudentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}
