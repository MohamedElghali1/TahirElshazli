import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Shape only - `weekStart` being a *real Saturday* is a service invariant (§6). */
export class GroupWeekQueryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  groupId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart must be formatted YYYY-MM-DD' })
  weekStart!: string;
}

export class PublishWeeklyReportsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  groupId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'weekStart must be formatted YYYY-MM-DD' })
  weekStart!: string;
}
