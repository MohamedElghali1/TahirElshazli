import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  WeeklyReport,
  WeeklyReportContent,
  WeeklyReportRepository,
  WeeklyReportWeek,
} from './interfaces/weekly-report-repository.interface.js';
import { WEEKLY_REPORT_REPOSITORY } from './interfaces/weekly-report-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_NOT_FOUND } from '../groups/groups.service.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { StudentSessionsService } from '../live-sessions/student-sessions.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { weekStartFor, weekWindow } from './week.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** 'Week of 3 Oct 2026' - the notification message naming the week. */
function formatWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number) as [number, number, number];
  return `Week of ${d} ${MONTH_NAMES[m - 1]} ${y}`;
}

/** One group-week's counts, enriched for the teacher/admin list. */
export interface WeeklyReportWeekView extends WeeklyReportWeek {
  groupName: string;
  courseTitle: string;
}

/** One report, enriched with the student's name for the group-week view. */
export interface WeeklyReportView extends WeeklyReport {
  studentName: string;
}

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
    @Inject(COURSE_REPOSITORY)
    private readonly courseRepo: CourseRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    private readonly assessmentsService: AssessmentsService,
    private readonly studentSessions: StudentSessionsService,
    private readonly enrollments: EnrollmentsService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
    private readonly notifications: NotificationsService,
  ) {}

  /** `weekStart` must be the real Saturday (Cairo calendar) it claims to be. */
  private assertValidWeekStart(weekStart: string): void {
    const { from } = weekWindow(weekStart);
    if (weekStartFor(from) !== weekStart) {
      throw new BadRequestException('weekStart must be a Saturday, formatted YYYY-MM-DD');
    }
  }

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

  /** The teacher/admin group-weeks list, newest week first. */
  async listWeeks(): Promise<WeeklyReportWeekView[]> {
    const weeks = await this.weeklyReportRepo.listWeeks();
    const groups = await this.groupRepo.findByIds(weeks.map((w) => w.groupId));
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const courses = await this.courseRepo.findByIds(groups.map((g) => g.courseId));
    const courseById = new Map(courses.map((c) => [c.id, c]));

    return weeks.map((w) => {
      const group = groupById.get(w.groupId);
      return {
        ...w,
        groupName: group?.name ?? 'Unknown group',
        courseTitle: (group && courseById.get(group.courseId)?.title) ?? 'Unknown course',
      };
    });
  }

  /** One group-week's reports, enriched with the student's name. 404 on an unknown group. */
  async listGroupWeek(groupId: string, weekStart: string): Promise<WeeklyReportView[]> {
    this.assertValidWeekStart(weekStart);
    const group = await this.groupRepo.findById(groupId);
    if (!group) throw new NotFoundException(GROUP_NOT_FOUND);

    const reports = await this.weeklyReportRepo.findByGroupWeek(groupId, weekStart);
    const students = await this.userRepo.findByIds(reports.map((r) => r.studentId));
    const studentById = new Map(students.map((s) => [s.id, s]));

    return reports.map((r) => ({
      ...r,
      studentName: studentById.get(r.studentId)?.name ?? 'Unknown',
    }));
  }

  /**
   * Flips every draft of a group-week to published, in one transaction with
   * its audit entry and the students' notifications - §5.4/§9's "a mutation
   * and its audit entry commit together" and the rule that an audited action
   * needs a union entry, a DTO filter entry and a spec, all held by this one
   * write.
   *
   * `AuditSnapshot` is flat and scalar only (`audit-log-repository.interface.ts`),
   * so `reportIds` travels as a comma-joined string rather than an array - the
   * closest a snapshot can carry the brief's `{ weekStart, reportIds, count }`
   * without widening that type for one caller.
   */
  async publishGroupWeek(actor: StaffActor, groupId: string, weekStart: string): Promise<WeeklyReport[]> {
    this.assertValidWeekStart(weekStart);

    return this.db.runInTransaction(async () => {
      const at = new Date().toISOString();
      const flipped = await this.weeklyReportRepo.publishGroupWeek(groupId, weekStart, actor.id, at);
      if (flipped.length === 0) {
        throw new ConflictException('Nothing to publish for this group and week.');
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'weekly_report.published',
        targetType: 'group',
        targetId: groupId,
        courseId: flipped[0]!.courseId,
        before: null,
        after: {
          weekStart,
          reportIds: flipped.map((r) => r.id).join(','),
          count: flipped.length,
        },
      });

      await this.notifications.fanOut(
        flipped.map((r) => r.studentId),
        {
          type: 'weekly_report',
          title: 'Your weekly report is ready',
          message: formatWeekLabel(weekStart),
          link: '/marks',
        },
      );

      return flipped;
    });
  }

  /**
   * A student's published reports, newest first, filtered to courses they are
   * still enrolled in - one `findForStudent` read, not one check per report
   * (§1's scale makes the loop cheap either way, but the brief asks for one
   * read and this is it).
   */
  async listPublishedForStudent(studentId: string): Promise<WeeklyReport[]> {
    const [reports, enrollments] = await Promise.all([
      this.weeklyReportRepo.findPublishedForStudent(studentId),
      this.enrollments.findForStudent(studentId),
    ]);
    const enrolledCourseIds = new Set(enrollments.map((e) => e.courseId));
    return reports.filter((r) => enrolledCourseIds.has(r.courseId));
  }
}
