import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * The body of `POST /auth/invitations/:token/accept` - just the password.
 * `token` is a path parameter (`API_SPEC.yaml:789`), not a body field.
 * Same password rule as `ConfirmPasswordResetDto` - one account-creation
 * path, one policy.
 */
export class AcceptInvitationDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;
}
