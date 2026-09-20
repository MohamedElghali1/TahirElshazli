import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import type {
  CourseRepository,
  StoredCourse,
} from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type {
  EnrollmentRepository,
} from '../enrollments/interfaces/enrollment-repository.interface.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import type { AssessmentRepository } from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { RecordingRepository } from '../recordings/interfaces/recording-repository.interface.js';
import { RECORDING_REPOSITORY } from '../recordings/interfaces/recording-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';

/**
 * Which courses the numbers on a screen cover. Sent to the UI and rendered,
 * because "12 students" means something different to a TA than to the teacher
 * and the screen must not let the two be confused.
 */
export type ManageScope = 'platform' | 'assigned';

export interface ManageCourseCard {
  id: string;
  title: string;
  teacherName: string;
  studentCount: number;
  recordingCount: number;
  awaitingGrading: number;
  /** When this TA was assigned, or null for the teacher, who holds no row. */
  assignedAt: string | null;
}

export interface ManageOverview {
  scope: ManageScope;
  courseCount: number;
  /** Distinct students across the in-scope courses, not a sum of rosters. */
  studentCount: number;
  recordingCount: number;
  awaitingGrading: number;
  courses: ManageCourseCard[];
}

export interface RosterEntry {
  studentId: string;
  name: string;
  email: string;
  enrolledAt: string;
  /** Performance, kept apart from completion progress (CLAUDE.md §5.1). */
  submittedCount: number;
  gradedCount: number;
  averageScorePercent: number | null;
}

export interface CourseRosterResponse {
  courseId: string;
  courseTitle: string;
  assessmentCount: number;
  /** Read-only for a TA (CLAUDE.md §2.2) - there is no unenroll route here. */
  entries: RosterEntry[];
}

export interface OutlineLesson {
  id: string;
  title: string;
}

export interface OutlineModule {
  id: string;
  title: string;
  chapter: string;
  lessons: OutlineLesson[];
}

/** Ceiling on the overview's course fan-out. Matches `MAX_COURSE_PAGE_SIZE`. */
const OVERVIEW_COURSE_LIMIT = 100;

/**
 * The reads shared by the TA and the teacher.
 *
 * Every method takes a `StaffActor` and puts it through `StaffScopeService`
 * before touching data. That is not defensive style - CLAUDE.md §5.11 is
 * explicit that a role check alone is the easiest way to leak the whole
 * platform through the API, and the scope service is the only thing here that
 * decides who sees what.
 */
@Injectable()
export class ManageService {
  constructor(
    private readonly scope: StaffScopeService,
    /** Global (`GroupDataModule`); the mode lives on the group now (§5.2). */
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    @Inject(ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepo: EnrollmentRepository,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    @Inject(RECORDING_REPOSITORY)
    private readonly recordingRepo: RecordingRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
  ) {}

  /**
   * The courses in scope for this actor, as whole records.
   *
   * Two queries chosen by `unscoped`, never one query filtered afterwards
   * (§5.11).
   */
  private async coursesInScope(actor: StaffActor): Promise<{
    scope: ManageScope;
    courses: StoredCourse[];
    assignedAt: Map<string, string>;
  }> {
    const scope = await this.scope.scopeFor(actor);
    if (scope.unscoped) {
      // A real limit rather than an accidental full-table read. A platform with
      // more courses than this needs a paged screen, not a taller one.
      const courses = await this.courseRepo.findAll(OVERVIEW_COURSE_LIMIT, 0);
      return { scope: 'platform', courses, assignedAt: new Map() };
    }
    const assignedAt = new Map(
      scope.assignments.map((a) => [a.courseId, a.assignedAt]),
    );
    const courses = await this.courseRepo.findByIds([...assignedAt.keys()]);
    return { scope: 'assigned', courses, assignedAt };
  }

  /**
   * Dashboard counts.
   *
   * Deliberately contains no money. CLAUDE.md §1: the client removed the
   * earnings widget, and that ban covers any revenue figure on any dashboard -
   * so there is nothing here a UI could accidentally render one from.
   */
  async overview(actor: StaffActor): Promise<ManageOverview> {
    const { scope, courses, assignedAt } = await this.coursesInScope(actor);
    const courseIds = courses.map((c) => c.id);

    // Four count-only reads, each one query regardless of how many courses are
    // in scope. This used to fan out per course - three `findByCourse` calls
    // and a submissions read each - which was `4N + 2` queries, but the cost
    // that actually bit was rows, not round trips: every enrollment, every
    // assessment, every submission and every recording of every course was
    // materialized on the console's landing page so four `.length` calls and a
    // `Set` could be taken over them. At ten groups of thirty that is thousands
    // of rows per login to produce six integers.
    const [studentCounts, studentCount, recordingCounts, awaitingByCourse] =
      await Promise.all([
        this.enrollmentRepo.countByCourses(courseIds),
        // Distinct people, not a sum of rosters: a student in two of the
        // teacher's groups is one person, and an inflated reach figure on a
        // dashboard is one nobody re-checks.
        this.enrollmentRepo.countDistinctStudents(courseIds),
        this.recordingRepo.countByCourses(courseIds),
        // Ungraded is still derived from correctedAt and never stored (§5.10);
        // the derivation now happens in SQL instead of over fetched rows.
        this.assessmentRepo.countUngradedSubmissionsByCourses(courseIds),
      ]);

    const cards: ManageCourseCard[] = courses.map((course) => ({
      id: course.id,
      title: course.title,
      teacherName: course.teacherName,
      studentCount: studentCounts[course.id] ?? 0,
      recordingCount: recordingCounts[course.id] ?? 0,
      awaitingGrading: awaitingByCourse[course.id] ?? 0,
      assignedAt: assignedAt.get(course.id) ?? null,
    }));

    return {
      scope,
      courseCount: cards.length,
      studentCount,
      recordingCount: cards.reduce((sum, c) => sum + c.recordingCount, 0),
      awaitingGrading: cards.reduce((sum, c) => sum + c.awaitingGrading, 0),
      courses: cards,
    };
  }

  /** The course roster. Read-only: §2.2 gives a TA no edit and no unenroll. */
  async roster(courseId: string, actor: StaffActor): Promise<CourseRosterResponse> {
    await this.scope.assertAssigned(courseId, actor);
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    const [enrollments, assessments] = await Promise.all([
      this.enrollmentRepo.findByCourse(courseId),
      this.assessmentRepo.findByCourse(courseId),
    ]);

    const [users, submissions] = await Promise.all([
      this.userRepo.findByIds(enrollments.map((e) => e.studentId)),
      this.assessmentRepo.findSubmissionsForAssessments(assessments.map((a) => a.id)),
    ]);

    const byId = new Map(users.map((u) => [u.id, u]));
    const maxScoreById = new Map(assessments.map((a) => [a.id, a.maxScore]));

    return {
      courseId,
      courseTitle: course.title,
      assessmentCount: assessments.length,
      entries: enrollments.flatMap((enrollment) => {
        const user = byId.get(enrollment.studentId);
        // An enrollment whose account is gone is dropped rather than rendered
        // as a nameless row - the same call `listCourseStaff` makes.
        if (!user) return [];

        const mine = submissions.filter((s) => s.studentId === enrollment.studentId);
        const graded = mine.filter((s) => s.score !== null && s.correctedAt !== null);

        // Averaged as a share of each assessment's own max, not as raw marks:
        // a 40-point assignment and a 10-point quiz cannot be averaged together
        // as numbers and mean anything (§5.6).
        const shares = graded.flatMap((s) => {
          const max = maxScoreById.get(s.assessmentId);
          return max && max > 0 ? [(s.score as number) / max] : [];
        });

        return [
          {
            studentId: enrollment.studentId,
            name: user.name,
            email: user.email,
            enrolledAt: enrollment.enrolledAt,
            submittedCount: mine.length,
            gradedCount: graded.length,
            averageScorePercent:
              shares.length > 0
                ? Math.round((shares.reduce((a, b) => a + b, 0) / shares.length) * 100)
                : null,
          },
        ];
      }),
    };
  }

  /**
   * A course's modules and lessons, for the recording upload form.
   *
   * `recordings.module_id` and `lesson_id` are NOT NULL foreign keys, so an
   * upload has to name a real lesson. This is where the form gets its options,
   * rather than expecting the teacher to know ids.
   */
  async outline(courseId: string, actor: StaffActor): Promise<OutlineModule[]> {
    await this.scope.assertAssigned(courseId, actor);
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    return course.modules.map((module) => ({
      id: module.id,
      title: module.title,
      chapter: module.chapter,
      lessons: module.lessons.map((lesson) => ({ id: lesson.id, title: lesson.title })),
    }));
  }
}
