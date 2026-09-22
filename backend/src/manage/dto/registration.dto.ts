import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { IsOptionalNotNull } from '../../common/validators/is-optional-not-null.js';

/**
 * The id alphabet the rest of the schema uses (`student-1`, or a UUID). Every
 * value here is parameterised where it is used, so this is not what stops
 * injection - it is what keeps a 404 a 404 rather than a driver error.
 */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Accepting a registration (`DOM-4`).
 *
 * `groupId` is **required**, and that is the decision the route exists to
 * record: accepting a student activates them, enrols them on the group's
 * course and places them in the cohort, in one transaction. An accept without
 * a group would leave an active account enrolled on nothing, which 404s on
 * every course read for a reason nobody can see from the screen.
 */
export class AcceptRegistrationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message: 'groupId must contain only letters, digits, hyphens and underscores',
  })
  groupId!: string;
}

/**
 * Rejecting one. The reason is optional and free text - it is written into the
 * audit entry, which is the only durable record of why a person was refused.
 *
 * `@IsOptionalNotNull` rather than `@IsOptional`: an explicit `null` here is a
 * client bug, not "clear the reason", and there is no stored column to clear.
 */
export class RejectRegistrationDto {
  @IsOptionalNotNull()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
