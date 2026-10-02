import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { WeeklyReportsService } from './weekly-reports.service.js';
import { WeeklyReportsScheduler } from './weekly-reports.scheduler.js';
import { WEEKLY_REPORT_REPOSITORY } from './interfaces/weekly-report-repository.interface.js';
import { InMemoryWeeklyReportRepository } from './repositories/in-memory-weekly-report.repository.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { InMemoryGroupRepository } from '../groups/repositories/in-memory-group.repository.js';
import { LIVE_SESSION_REPOSITORY } from '../live-sessions/interfaces/live-session-repository.interface.js';
import { InMemoryLiveSessionRepository } from '../live-sessions/repositories/in-memory-live-session.repository.js';
import { ATTENDANCE_REPOSITORY } from '../live-sessions/interfaces/attendance-repository.interface.js';
import { InMemoryAttendanceRepository } from '../live-sessions/repositories/in-memory-attendance.repository.js';
import { StudentSessionsService } from '../live-sessions/student-sessions.service.js';
import { AssessmentsService } from '../assessments/assessments.service.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { NewAssessment } from '../assessments/interfaces/assessment-repository.interface.js';
import { InMemoryAssessmentRepository } from '../assessments/repositories/in-memory-assessment.repository.js';
import { WORK_REPOSITORY } from '../assessments/interfaces/work-repository.interface.js';
import { InMemoryWorkRepository } from '../assessments/repositories/in-memory-work.repository.js';
import { SUBMISSION_ANNOTATION_REPOSITORY } from '../assessments/interfaces/submission-annotation-repository.interface.js';
import { InMemorySubmissionAnnotationRepository } from '../assessments/repositories/in-memory-submission-annotation.repository.js';
import { StudentGroupsService } from '../groups/student-groups.service.js';
import { EnrollmentsService } from '../enrollments/enrollments.service.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { InMemoryEnrollmentRepository } from '../enrollments/repositories/in-memory-enrollment.repository.js';
import { FileUrls } from '../common/storage/file-urls.service.js';
import { FILE_STORAGE } from '../common/storage/file-storage.interface.js';

const STUDENT_1 = 'student-1';

/** Shared base for a test task - every `StoredAssessment` field this suite does not vary. */
function baseTask(overrides: Partial<NewAssessment> = {}): NewAssessment {
  return {
    courseId: 'course-1',
    lessonId: null,
    title: 'Task',
    description: '',
    instructions: '',
    type: 'homework',
    workType: 'file_upload',
    externalUrl: null,
    topics: [],
    availableFrom: '2030-01-01T00:00:00Z',
    availableTo: '2030-02-01T00:00:00Z',
    dueAt: '2030-01-08T12:00:00Z',
    maxScore: 10,
    allowedFileTypes: [],
    maxFileSizeBytes: 0,
    visibility: 'published',
    markerId: null,
    allowResubmission: true,
    submissionModes: [],
    draftId: null,
    attachments: [],
    ...overrides,
  };
}

describe('WeeklyReportsService composition (REM-031)', () => {
  let module: TestingModule;
  let weeklyReports: WeeklyReportsService;
  let groupRepo: InMemoryGroupRepository;
  let sessionRepo: InMemoryLiveSessionRepository;
  let attendanceRepo: InMemoryAttendanceRepository;
  let assessmentRepo: InMemoryAssessmentRepository;
  let workRepo: InMemoryWorkRepository;
  let weeklyReportRepo: InMemoryWeeklyReportRepository;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        WeeklyReportsService,
        AssessmentsService,
        StudentSessionsService,
        StudentGroupsService,
        EnrollmentsService,
        FileUrls,
        { provide: FILE_STORAGE, useValue: null },
        { provide: GROUP_REPOSITORY, useClass: InMemoryGroupRepository },
        { provide: LIVE_SESSION_REPOSITORY, useClass: InMemoryLiveSessionRepository },
        { provide: ATTENDANCE_REPOSITORY, useClass: InMemoryAttendanceRepository },
        { provide: ASSESSMENT_REPOSITORY, useClass: InMemoryAssessmentRepository },
        { provide: WORK_REPOSITORY, useClass: InMemoryWorkRepository },
        {
          provide: SUBMISSION_ANNOTATION_REPOSITORY,
          useClass: InMemorySubmissionAnnotationRepository,
        },
        { provide: ENROLLMENT_REPOSITORY, useClass: InMemoryEnrollmentRepository },
        { provide: WEEKLY_REPORT_REPOSITORY, useClass: InMemoryWeeklyReportRepository },
      ],
    }).compile();

    weeklyReports = module.get(WeeklyReportsService);
    groupRepo = module.get(GROUP_REPOSITORY);
    sessionRepo = module.get(LIVE_SESSION_REPOSITORY);
    attendanceRepo = module.get(ATTENDANCE_REPOSITORY);
    assessmentRepo = module.get(ASSESSMENT_REPOSITORY);
    workRepo = module.get(WORK_REPOSITORY);
    weeklyReportRepo = module.get(WEEKLY_REPORT_REPOSITORY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('attendance', () => {
    const WEEK_START = '2030-01-05'; // Sat 2030-01-05 Cairo .. Fri 2030-01-11
    const WEEK_FROM = '2030-01-04T22:00:00.000Z';
    const WEEK_TO = '2030-01-11T22:00:00.000Z';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-01-09T00:00:00Z')); // mid-week
    });

    it('counts present/late/absent/unmarked separately, excluding out-of-window, other-group, unpublished and not-yet-ended sessions', async () => {
      const present = await sessionRepo.create({
        groupId: 'group-1',
        title: 'present',
        meetingLink: null,
        scheduledAt: '2030-01-06T18:00:00Z',
        endsAt: '2030-01-06T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });
      const late = await sessionRepo.create({
        groupId: 'group-1',
        title: 'late',
        meetingLink: null,
        scheduledAt: '2030-01-07T18:00:00Z',
        endsAt: '2030-01-07T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });
      const absent = await sessionRepo.create({
        groupId: 'group-1',
        title: 'absent',
        meetingLink: null,
        scheduledAt: '2030-01-07T20:00:00Z',
        endsAt: '2030-01-07T21:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });
      await sessionRepo.create({
        groupId: 'group-1',
        title: 'unmarked',
        meetingLink: null,
        scheduledAt: '2030-01-08T18:00:00Z',
        endsAt: '2030-01-08T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });
      // Outside the window (next week).
      await sessionRepo.create({
        groupId: 'group-1',
        title: 'next week',
        meetingLink: null,
        scheduledAt: '2030-01-13T18:00:00Z',
        endsAt: '2030-01-13T19:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });
      // Another group, in the window - must not count toward group-1's report.
      await sessionRepo.create({
        groupId: 'group-2',
        title: 'other group',
        meetingLink: null,
        scheduledAt: '2030-01-06T10:00:00Z',
        endsAt: '2030-01-06T11:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });
      // Unpublished, in the window.
      await sessionRepo.create({
        groupId: 'group-1',
        title: 'planned',
        meetingLink: null,
        scheduledAt: '2030-01-06T12:00:00Z',
        endsAt: '2030-01-06T13:00:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'planned',
      });
      // Published, in the window, but has not ended relative to "now".
      await sessionRepo.create({
        groupId: 'group-1',
        title: 'not yet ended',
        meetingLink: null,
        scheduledAt: '2030-01-09T20:00:00Z',
        endsAt: '2030-01-09T21:30:00Z',
        assistantId: null,
        description: null,
        privateNotes: null,
        isVisible: true,
        state: 'published',
      });

      await attendanceRepo.upsert({
        sessionId: present.id,
        studentId: STUDENT_1,
        status: 'present',
        markedBy: 'teacher-1',
        markedAt: '2030-01-06T20:00:00Z',
      });
      await attendanceRepo.upsert({
        sessionId: late.id,
        studentId: STUDENT_1,
        status: 'late',
        markedBy: 'teacher-1',
        markedAt: '2030-01-07T20:00:00Z',
      });
      await attendanceRepo.upsert({
        sessionId: absent.id,
        studentId: STUDENT_1,
        status: 'absent',
        markedBy: 'teacher-1',
        markedAt: '2030-01-07T22:00:00Z',
      });

      const content = await weeklyReports.compose(
        'group-1',
        STUDENT_1,
        'course-1',
        WEEK_START,
      );

      expect(content.attendance).toEqual({
        present: 1,
        late: 1,
        absent: 1,
        unmarked: 1,
        expected: 4,
        sessions: [
          { sessionId: present.id, title: 'present', scheduledAt: '2030-01-06T18:00:00Z', status: 'present' },
          { sessionId: late.id, title: 'late', scheduledAt: '2030-01-07T18:00:00Z', status: 'late' },
          { sessionId: absent.id, title: 'absent', scheduledAt: '2030-01-07T20:00:00Z', status: 'absent' },
          {
            sessionId: content.attendance.sessions[3]!.sessionId,
            title: 'unmarked',
            scheduledAt: '2030-01-08T18:00:00Z',
            status: null,
          },
        ],
      });
      // Sanity: window boundaries as expected (`week.spec.ts` owns the maths itself).
      expect(WEEK_FROM < WEEK_TO).toBe(true);
    });
  });

  describe('homework', () => {
    const WEEK_START = '2030-01-05';

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2030-01-09T00:00:00Z'));
    });

    it('only tasks due in the week; untargeted and hidden excluded; returned mark appears, unreturned is null; google_form shows the imported score', async () => {
      // Targeted to group-1, due in the window, returned mark.
      const returned = await assessmentRepo.create(
        baseTask({ title: 'Returned', dueAt: '2030-01-06T12:00:00Z' }),
      );
      await assessmentRepo.setTargets(returned.id, [{ groupId: 'group-1' }]);
      const returnedSub = await assessmentRepo.createSubmission(
        returned.id,
        STUDENT_1,
        null,
        'my answer',
        [],
      );
      await assessmentRepo.gradeSubmission(returnedSub.id, {
        score: 8,
        feedback: null,
        annotatedFileUrl: undefined,
      });
      await assessmentRepo.returnSubmission(returnedSub.id);

      // Targeted, due in window, graded but NOT returned - score stays null.
      const unreturned = await assessmentRepo.create(
        baseTask({ title: 'Marked, not returned', dueAt: '2030-01-07T12:00:00Z' }),
      );
      await assessmentRepo.setTargets(unreturned.id, [{ groupId: 'group-1' }]);
      const unreturnedSub = await assessmentRepo.createSubmission(
        unreturned.id,
        STUDENT_1,
        null,
        'answer',
        [],
      );
      await assessmentRepo.gradeSubmission(unreturnedSub.id, {
        score: 9,
        feedback: null,
        annotatedFileUrl: undefined,
      });

      // Targeted, due in window, nothing submitted.
      const notSubmitted = await assessmentRepo.create(
        baseTask({ title: 'Not submitted', dueAt: '2030-01-08T12:00:00Z' }),
      );
      await assessmentRepo.setTargets(notSubmitted.id, [{ groupId: 'group-1' }]);

      // Targeted, due in window, hidden - excluded entirely.
      const hidden = await assessmentRepo.create(
        baseTask({ title: 'Hidden', dueAt: '2030-01-08T12:00:00Z', visibility: 'hidden' }),
      );
      await assessmentRepo.setTargets(hidden.id, [{ groupId: 'group-1' }]);

      // Due in window, but targeted to a group student-1 does NOT hold.
      const otherGroup = await groupRepo.create({
        name: 'Other section',
        teacherId: 'teacher-1',
        courseId: 'course-1',
        assistantId: null,
        meets: null,
        room: null,
      });
      const untargeted = await assessmentRepo.create(
        baseTask({ title: 'Untargeted', dueAt: '2030-01-08T12:00:00Z' }),
      );
      await assessmentRepo.setTargets(untargeted.id, [{ groupId: otherGroup.id }]);

      // Targeted, but due NEXT week - excluded by the window.
      const nextWeek = await assessmentRepo.create(
        baseTask({ title: 'Next week', dueAt: '2030-01-13T12:00:00Z' }),
      );
      await assessmentRepo.setTargets(nextWeek.id, [{ groupId: 'group-1' }]);

      // Google Form task, due in window, no submission row - the mirrored
      // result carries the score.
      const form = await assessmentRepo.create(
        baseTask({
          title: 'Google Form',
          dueAt: '2030-01-08T18:00:00Z',
          workType: 'google_form',
        }),
      );
      await assessmentRepo.setTargets(form.id, [{ groupId: 'group-1' }]);
      await workRepo.replaceResults(form.id, 'google_form', [
        {
          assessmentId: form.id,
          provider: 'google_form',
          externalId: randomUUID(),
          studentId: STUDENT_1,
          respondentId: 'student1@example.com',
          score: 7,
          maxScore: 20, // the form's own total, not the task's 10
          submittedAt: '2030-01-07T09:00:00Z',
          raw: {},
        },
      ]);

      const content = await weeklyReports.compose(
        'group-1',
        STUDENT_1,
        'course-1',
        WEEK_START,
      );

      const byTitle = new Map(content.homework.tasks.map((t) => [t.title, t]));
      expect([...byTitle.keys()].sort()).toEqual(
        ['Returned', 'Marked, not returned', 'Not submitted', 'Google Form'].sort(),
      );

      expect(byTitle.get('Returned')).toMatchObject({ status: 'corrected', score: 8, maxScore: 10 });
      expect(byTitle.get('Marked, not returned')).toMatchObject({ status: 'submitted', score: null });
      expect(byTitle.get('Not submitted')).toMatchObject({ status: 'available', score: null });
      // The imported mark keeps the form's own denominator (20), not the task's 10.
      expect(byTitle.get('Google Form')).toMatchObject({ status: 'submitted', score: 7, maxScore: 20 });

      expect(content.homework.due).toBe(4);
      // submitted/corrected only: Returned (corrected) + Marked-not-returned
      // (submitted) + Google Form (submitted) = 3. "Not submitted" (available)
      // does not count.
      expect(content.homework.submitted).toBe(3);
    });
  });

  describe('generateWeek', () => {
    const WEEK_START = '2031-02-01';

    it('first run inserts one draft per member; second run updates and inserts nothing new; a published row survives regeneration byte-for-byte', async () => {
      const first = await weeklyReports.generateWeek(WEEK_START, new Date('2031-02-08T00:00:00Z'));
      // Seed fixtures: group-1 (student-1, student-2) + group-2 (student-1) = 3 members total.
      expect(first).toEqual({ inserted: 3, updated: 0, skipped: 0 });

      const second = await weeklyReports.generateWeek(WEEK_START, new Date('2031-02-08T01:00:00Z'));
      expect(second).toEqual({ inserted: 0, updated: 3, skipped: 0 });

      const group1Reports = await weeklyReportRepo.findByGroupWeek('group-1', WEEK_START);
      const toPublish = group1Reports.find((r) => r.studentId === 'student-1')!;
      await weeklyReportRepo.publishGroupWeek(
        'group-1',
        WEEK_START,
        'admin-1',
        '2031-02-08T02:00:00Z',
      );
      const publishedSnapshot = JSON.stringify(
        (await weeklyReportRepo.findByGroupWeek('group-1', WEEK_START)).find(
          (r) => r.id === toPublish.id,
        ),
      );

      const third = await weeklyReports.generateWeek(WEEK_START, new Date('2031-02-08T03:00:00Z'));
      // `publishGroupWeek` flips every draft of that group-week, so both
      // group-1 rows (student-1, student-2) are now published and skipped;
      // only group-2/student-1 is still a draft and refreshes.
      expect(third).toEqual({ inserted: 0, updated: 1, skipped: 2 });

      const afterRegeneration = JSON.stringify(
        (await weeklyReportRepo.findByGroupWeek('group-1', WEEK_START)).find(
          (r) => r.id === toPublish.id,
        ),
      );
      expect(afterRegeneration).toBe(publishedSnapshot);
    });
  });
});

describe('WeeklyReportsScheduler (REM-031)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('does nothing when NODE_ENV === "test", and keeps no timer alive', () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.useFakeTimers();
    const generateWeek = vi.fn();
    const scheduler = new WeeklyReportsScheduler({
      generateWeek,
    } as unknown as WeeklyReportsService);

    scheduler.onApplicationBootstrap();

    expect(generateWeek).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    scheduler.onModuleDestroy();
  });
});
