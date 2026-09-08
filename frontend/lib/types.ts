/**
 * Response shapes mirrored from the NestJS backend. Every interface here has a
 * counterpart under `backend/src/**` and the two must not drift - a field this
 * file invents renders as `undefined` in production.
 *
 * Source of truth per block is cited above it.
 */

/* --- auth (auth/auth.service.ts, auth/roles.enum.ts) ---------------------- */

export type Role = 'visitor' | 'student' | 'parent' | 'assistant' | 'teacher';

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthResult {
  accessToken: string;
  user: AuthenticatedUser;
}

/* --- courses (courses/courses.service.ts, interfaces/course-repository) --- */

export type LearningMode = 'recorded' | 'live';

export interface Lesson {
  id: string;
  title: string;
  order: number;
  durationSeconds: number;
}

export interface CourseModule {
  id: string;
  title: string;
  chapter: string;
  order: number;
  lessons: Lesson[];
}

export interface CompletionCheckpoint {
  lessonId: string;
  title: string;
  completedAt: string | null;
}

/** CLAUDE.md §5.1 - completion. Never merged with the grade averages below. */
export interface RecordedProgress {
  type: 'recorded';
  completedLessons: number;
  totalLessons: number;
  completionPercentage: number;
  checkpoints: CompletionCheckpoint[];
}

export interface AttendanceEntry {
  sessionId: string;
  title: string;
  sessionDate: string;
  attended: boolean;
}

/** CLAUDE.md §5.2 - live-mode courses render this timeline instead. */
export interface LiveProgress {
  type: 'live';
  attendedSessions: number;
  totalSessions: number;
  attendancePercentage: number;
  timeline: AttendanceEntry[];
}

export type CourseProgress = RecordedProgress | LiveProgress;

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  learningMode: LearningMode;
  progress: CourseProgress;
}

export interface CourseDetail extends CourseListItem {
  sequentialLockEnabled: boolean;
  modules: CourseModule[];
}

/**
 * A catalog row - a course the student may or may not hold yet.
 *
 * Has no `progress`, unlike `CourseListItem`, and that is the point: there is
 * no completion figure for a course nobody has started, and a zeroed one would
 * read as "0% done" rather than "not started".
 */
export interface CatalogItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  learningMode: LearningMode;
  moduleCount: number;
  lessonCount: number;
  enrolled: boolean;
}

/* --- live sessions (live-sessions/interfaces/live-session-repository) -----
   A live session is a scheduled time plus a meeting link the teacher pastes
   (Google Meet, Zoom, anything). There is no embed and no API automation. */

export interface LiveSession {
  id: string;
  courseId: string;
  title: string;
  zoomLink: string;
  scheduledAt: string;
  durationMinutes: number;
}

export interface LiveSessionWithAttendance extends LiveSession {
  attended: boolean;
  attendedAt: string | null;
}

export interface LiveSessionListResponse {
  upcoming: LiveSession[];
  past: LiveSessionWithAttendance[];
}

/* --- materials (materials/interfaces/material-repository) ----------------- */

export type MaterialCategory =
  | 'course_notes'
  | 'study_materials'
  | 'important_files';

export interface Material {
  id: string;
  courseId: string;
  title: string;
  description: string | null;
  category: MaterialCategory;
  chapter: string | null;
  fileUrl: string;
  fileType: string;
  fileSizeBytes: number;
  uploadedAt: string;
}

export type MaterialsByCategory = Record<MaterialCategory, Material[]>;
export type MaterialCounts = Record<MaterialCategory, number>;

/* --- recordings (recordings/interfaces/recording-repository) -------------- */

export interface Recording {
  id: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  title: string;
  chapter: string;
  topics: string[];
  videoUrl: string;
  durationSeconds: number;
  lessonDate: string;
  order: number;
}

export interface RecordingWithProgress extends Recording {
  watchedSeconds: number;
  completed: boolean;
  completedAt: string | null;
}

export interface RecordingListResponse {
  recordings: RecordingWithProgress[];
  filters: { chapters: string[]; topics: string[] };
}

export interface RecordingProgress {
  recordingId: string;
  studentId: string;
  watchedSeconds: number;
  completed: boolean;
  completedAt: string | null;
  updatedAt: string;
}

/* --- assessments (assessments/assessments.service.ts) ---------------------
   CLAUDE.md §5.10 - `status` is derived server-side from timestamps and
   submission state. The client renders it and never recomputes it. */

export type AssessmentType = 'homework' | 'assignment' | 'quiz';
export type AssessmentStatus = 'locked' | 'available' | 'submitted' | 'corrected';

export interface AssessmentListItem {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  type: AssessmentType;
  topics: string[];
  status: AssessmentStatus;
  availableFrom: string;
  dueAt: string;
  isOverdue: boolean;
  maxScore: number;
  score: number | null;
  scorePercentage: number | null;
}

export interface SubmissionRevision {
  id: string;
  submissionId: string;
  fileUrl: string | null;
  answerText: string | null;
  /** When this content was submitted. */
  submittedAt: string;
  /** When the student replaced it. */
  replacedAt: string;
}

export interface SubmissionView {
  id: string;
  fileUrl: string | null;
  answerText: string | null;
  submittedAt: string;
  lastSubmittedAt: string;
  updatedAt: string;
  score: number | null;
  correctedAt: string | null;
  feedback: string | null;
  /** CLAUDE.md §5.5 - the annotated PDF is a new artifact beside the original. */
  annotatedFileUrl: string | null;
  revisions: SubmissionRevision[];
}

export interface AssessmentDetail extends AssessmentListItem {
  instructions: string;
  availableTo: string;
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  canSubmit: boolean;
  submission: SubmissionView | null;
}

/* --- dashboard (dashboard/dashboard.service.ts) --------------------------- */

export interface DashboardStats {
  homeworkPending: number;
  answersAvailable: number;
  newRecordings: number;
  overallReportPercentage: number | null;
}

export interface DashboardResponse {
  studentName: string;
  course: {
    id: string;
    title: string;
    teacherName: string;
    learningMode: LearningMode;
  };
  progress: CourseProgress;
  stats: DashboardStats;
  nextLiveSession: LiveSession | null;
  quickAccess: MaterialCounts;
  unreadNotifications: number;
}

/* --- reports (reports/reports.service.ts) --------------------------------- */

export interface TopicScore {
  topic: string;
  percentage: number;
  gradedCount: number;
}

export interface PerformanceSnapshot {
  quizAverage: number | null;
  assignmentAverage: number | null;
  homeworkSubmissionRate: number;
  overallPercentage: number | null;
  gradedCount: number;
}

export interface ReportSummary {
  courseId: string;
  progress: CourseProgress;
  performance: PerformanceSnapshot;
  strongAreas: TopicScore[];
  needsImprovement: TopicScore[];
}

export interface ReportDocument {
  id: string;
  courseId: string;
  studentId: string;
  title: string;
  period: string;
  fileUrl: string;
  overallPercentage: number | null;
  issuedAt: string;
}

/* --- notifications (notifications/interfaces/notification-repository) ----- */

export type NotificationType =
  | 'grade_posted'
  | 'new_recording'
  | 'live_session_soon'
  | 'assessment_available';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  /** In-app deep link, never an absolute URL. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  notifications: AppNotification[];
  unreadCount: number;
}

/* --- students (students/interfaces/student-repository) -------------------- */

export interface StudentProfile {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  enrolledCourseCount: number;
  createdAt: string;
  updatedAt: string;
}

/* ========================================================================
   TA & ADMIN SURFACE
   ------------------------------------------------------------------------
   Mirrors backend/src/manage/*. Two route families, and the split is the
   whole access-control design (CLAUDE.md 5.11):

     /staff/*  - shared. Scoped to a TA's assigned courses, unscoped for the
                 teacher. Both roles reach the same handlers.
     /admin/*  - teacher only, never scoped.

   None of these shapes carries money. CLAUDE.md 1: no earnings widget on any
   dashboard, so there is no revenue field here for a screen to render.
   ======================================================================== */

/** Which courses the numbers cover. Rendered, so the two readings never blur. */
export type ManageScope = 'platform' | 'assigned';

/** `GET /staff/courses` - the same handler serves both roles. */
export interface StaffCourseSummary {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  /** Null for the teacher, who reaches this unscoped and holds no assignment. */
  assignedAt: string | null;
}

export interface ManageCourseCard {
  id: string;
  title: string;
  teacherName: string;
  studentCount: number;
  recordingCount: number;
  awaitingGrading: number;
  /** When this TA was assigned; null for the teacher, who holds no row. */
  assignedAt: string | null;
}

export interface ManageOverview {
  scope: ManageScope;
  courseCount: number;
  /** Distinct students, not a sum of rosters. */
  studentCount: number;
  recordingCount: number;
  awaitingGrading: number;
  courses: ManageCourseCard[];
}

export interface RosterEntry {
  studentId: string;
  name: string;
  email: string;
  learningMode: LearningMode;
  enrolledAt: string;
  submittedCount: number;
  gradedCount: number;
  /** Performance. Never merged with completion progress (CLAUDE.md 5.1). */
  averageScorePercent: number | null;
}

export interface CourseRosterResponse {
  courseId: string;
  courseTitle: string;
  assessmentCount: number;
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

export type GradingStatus = 'awaiting' | 'graded';

export interface GradingQueueItem {
  submissionId: string;
  assessmentId: string;
  assessmentTitle: string;
  assessmentType: AssessmentType;
  maxScore: number;
  studentId: string;
  studentName: string;
  studentEmail: string;
  submittedAt: string;
  lastSubmittedAt: string;
  fileUrl: string | null;
  answerText: string | null;
  annotatedFileUrl: string | null;
  score: number | null;
  feedback: string | null;
  correctedAt: string | null;
  /** Server-derived, like every status on this platform (CLAUDE.md 5.10). */
  status: GradingStatus;
  isLate: boolean;
}

/** Cohort-wide averages per task (CLAUDE.md 5.6) - was it hard or easy? */
export interface AssessmentAverage {
  assessmentId: string;
  title: string;
  type: AssessmentType;
  maxScore: number;
  submissionCount: number;
  gradedCount: number;
  averageScorePercent: number | null;
}

export interface GradingQueueResponse {
  courseId: string;
  items: GradingQueueItem[];
  assessments: AssessmentAverage[];
}

/** The staff view of a recording: no student's watch progress attached. */
export interface StaffRecording {
  id: string;
  courseId: string;
  moduleId: string;
  lessonId: string;
  title: string;
  chapter: string;
  topics: string[];
  videoUrl: string;
  durationSeconds: number;
  lessonDate: string;
  order: number;
}

export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface StudentDirectoryEntry extends DirectoryEntry {
  enrolledCourseCount: number;
}

/* --- staff assignment (staff/staff.service.ts) --------------------------- */

export interface CourseStaffMember {
  userId: string;
  name: string;
  email: string;
  assignedAt: string;
  assignedBy: string;
}

/* --- audit log (audit/interfaces/audit-log-repository) ------------------- */

export type AuditAction =
  | 'course_staff.assigned'
  | 'course_staff.unassigned'
  | 'submission.graded'
  | 'recording.created'
  | 'recording.updated'
  | 'recording.deleted';

export interface AuditLogEntry {
  id: string;
  actorId: string;
  /** The actor's role at the time of the action, not their role now. */
  actorRole: Role;
  action: AuditAction;
  targetType: string;
  targetId: string;
  courseId: string | null;
  before: Record<string, string | number | boolean | null> | null;
  after: Record<string, string | number | boolean | null> | null;
  createdAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  /** Keyset cursor. Null at the end of the feed. */
  nextCursor: string | null;
}

/* ------------------------------------------------------------------------
   Public catalog - the Visitor surface (`GET /public/courses`).

   Anonymous, so nothing here may carry anything a signed-out reader must not
   see. The backend maps these field by field out of storage for that reason;
   the shapes below are the other half of that contract.
   ------------------------------------------------------------------------ */

/** A lesson as it appears in a public syllabus: named, timed, not playable. */
export interface PublicOutlineLesson {
  id: string;
  title: string;
  order: number;
  durationSeconds: number;
}

export interface PublicOutlineModule {
  id: string;
  title: string;
  chapter: string;
  order: number;
  lessons: PublicOutlineLesson[];
}

export interface PublicCourseSummary {
  id: string;
  /** The public URL segment. Course ids never appear in a visitor's address bar. */
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
  /** Drives the Live / Recorded badge (CLAUDE.md §5.2). */
  learningMode: LearningMode;
  moduleCount: number;
  lessonCount: number;
  totalDurationSeconds: number;
}

export interface PublicCourseDetail extends PublicCourseSummary {
  modules: PublicOutlineModule[];
}
