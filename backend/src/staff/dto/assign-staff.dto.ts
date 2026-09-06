import { IsString, Matches, MaxLength } from 'class-validator';

export class AssignStaffDto {
  /**
   * The assistant's user id. Constrained to the id alphabet this schema uses
   * (`assistant-1`, or a UUID) rather than left as free text: it is
   * concatenated into nothing and parameterized everywhere, but a bounded id is
   * also one fewer thing to reason about in an audit entry read a year later.
   */
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'userId must contain only letters, digits, hyphens and underscores',
  })
  userId!: string;
}
