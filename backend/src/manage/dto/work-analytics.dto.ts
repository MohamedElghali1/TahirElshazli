import { IsString, Matches, MaxLength } from 'class-validator';

/** The id alphabet this schema uses, matching `AssessmentTargetDto.groupId`. */
const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Which student an unmatched response belongs to.
 *
 * Only the id: the response is already identified by the path parameter, and
 * accepting anything else here - a name to match on, an email to trust - would
 * be a second way to decide identity beside the one the sync already failed at.
 */
export class AttachResultDto {
  @IsString()
  @MaxLength(64)
  @Matches(ID_PATTERN, {
    message:
      'studentId must contain only letters, digits, hyphens and underscores',
  })
  studentId!: string;
}
