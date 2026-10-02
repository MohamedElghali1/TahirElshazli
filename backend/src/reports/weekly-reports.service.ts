import { Inject, Injectable } from '@nestjs/common';
import type {
  WeeklyReportContent,
  WeeklyReportRepository,
} from './interfaces/weekly-report-repository.interface.js';
import { WEEKLY_REPORT_REPOSITORY } from './interfaces/weekly-report-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { StudentSessionsService } from '../live-sessions/student-sessions.service.js';
import { weekWindow } from './week.js';

/**
 * How many groups one `generateWeek` pass reads. The platform runs ~10
 * (`CLAUDE.md` §1); this is ten times that, the same ceiling
 * `manage-live-sessions.service.ts`'s `MAX_GROUPS_FOR_UNSCOPED_GRID` uses for
 * the same reason - a silent truncation on a number nobody expects to
 * approach, rather than an "every group" repository method built for one
 * caller.
 */
const MAX_GROUPS_PER_GENERATION = 100;

export interface GenerateWeekResult {
  inserted: number;
  updated: number;
  skipped: number;
}

/**
 * Composes and generates weekly reports (`REM-031`, `D-63`, `D-66`).
 *
 * `compose` is pure assembly - it owns no arithmetic of its own, only the two
 * existing rules (`StudentSessionsService.getAttendanceForGroupWeek`,
 * `AssessmentsService.getTasksDueInWeek`) and the `due`/`submitted` counts
 * `CLAUDE.md` §11.1 requires to stay separate from any mark.
 */
@Injectable()
export class WeeklyReportsService {
  constructor(
    @Inject(WEEKLY_REPORT_REPOSITORY)
    private readonly weeklyReportRepo: WeeklyReportRepository,
    @Inject(GROUP_REPOSITORY)
    private readonly groupRepo: GroupRepository,
    private readonly assessmentsService: AssessmentsService,
    private readonly studentSessions: StudentSessionsService,
  ) {}

  async compose(
    groupId: string,
    studentId: string,
    courseId: string,
    weekStart: string,
  ): Promise<WeeklyReportContent> {
    const { from, to } = weekWindow(weekStart);
    const [attendance, tasks] = await Promise.all([
      this.studentSessions.getAttendanceForGroupWeek(groupId, studentId, from, to),
      this.assessmentsService.getTasksDueInWeek(courseId, studentId, from, to),
    ]);

    const submitted = tasks.filter(
      (t) => t.status === 'submitted' || t.status === 'corrected',
    ).length;

    return {
      attendance: {
        present: attendance.present,
        late: attendance.late,
        absent: attendance.absent,
        unmarked: attendance.unmarked,
        expected: attendance.expected,
        sessions: attendance.sessions,
      },
      homework: {
        due: tasks.length,
        submitted,
        tasks,
      },
    };
  }

  /**
   * For every group, for each current member, composes that student's report
   * and upserts the draft. Idempotent: re-running refreshes a draft and
   * leaves a published row untouched (the repository's own SQL/memory guard,
   * not re-checked here).
   */
  async generateWeek(
    weekStart: string,
    now: Date = new Date(),
  ): Promise<GenerateWeekResult> {
    const result: GenerateWeekResult = { inserted: 0, updated: 0, skipped: 0 };
    const groups = await this.groupRepo.findAll(MAX_GROUPS_PER_GENERATION, 0);
    const generatedAt = now.toISOString();

    for (const group of groups) {
      const members = await this.groupRepo.findMembers(group.id);
      for (const member of members) {
        const content = await this.compose(
          group.id,
          member.studentId,
          group.courseId,
          weekStart,
        );
        const outcome = await this.weeklyReportRepo.upsertDraft({
          groupId: group.id,
          studentId: member.studentId,
          courseId: group.courseId,
          weekStart,
          content,
          generatedAt,
        });
        result[outcome] += 1;
      }
    }

    return result;
  }
}
