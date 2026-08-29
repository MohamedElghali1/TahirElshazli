import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  newPassword!: string;
}
