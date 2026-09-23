import { IsISO8601 } from 'class-validator';

/**
 * Query filter for the student timetable (`GET /students/me/timetable?from=&to=`).
 *
 * Deliberately smaller than `ListSessionsQueryDto` (`manage/dto/session.dto.ts`):
 * there is no `groupId` field here. A student's timetable is always every group
 * they belong to - accepting a `groupId` from the client would be a field the
 * DTO has no business declaring on a route that must never take a scope
 * parameter from the caller (`PHASE_PLAN.md` §3.2: "never accept a studentId").
 */
export class TimetableQueryDto {
  @IsISO8601()
  from!: string;

  @IsISO8601()
  to!: string;
}
