/**
 * Response shapes mirrored from the NestJS backend. Every interface here has a
 * counterpart under `backend/src/**` and the two must not drift - a field this
 * file invents renders as `undefined` in production.
 *
 * Source of truth per block is cited above it.
 */

/* --- auth (auth/auth.service.ts, auth/roles.enum.ts) ---------------------- */

export type Role =
  | 'visitor'
  | 'student'
  | 'parent'
  | 'assistant'
  | 'admin'
  | 'teacher';

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

export interface AttendanceEntry {
  sessionId: string;
  title: string;
  sessionDate: string;
  attended: boolean;
}

/**
 * One shape, carrying **both** halves - completion and attendance.
 *
 * This mirrors `courses.service.ts`, where it was a discriminated union keyed
 * on the student's learning mode until `D-9` retired that axis (2026-09-20).
 * Every course now has recordings to watch *and* sessions to attend, so both
 * halves are always present; a course with no sessions reports `0 of 0` rather
 * than serving a different shape.
 *
 * **Render them as two `Meter`s and never average them** (CLAUDE.md §11.1
 * non-negotiable 2). `completionPercentage` and `attendancePercentage` measure
 * different things - watching the material and turning up - and one blended
 * figure would say neither. Grades never appear here at all: performance is
 * `ReportSummary.performance`, and progress and performance never merge.
 */
export interface CourseProgress {
  completedLessons: number;
  totalLessons: number;
  completionPercentage: number;
  checkpoints: CompletionCheckpoint[];

  attendedSessions: number;
  totalSessions: number;
  attendancePercentage: number;
  timeline: AttendanceEntry[];
}

export interface CourseListItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  teacherName: string;
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
  };
  progress: CourseProgress;
  stats: DashboardStats;
  nextLiveSession: LiveSession | null;
  quickAccess: MaterialCounts;
  unreadNotifications: number;
}

/* --- the aggregated Home screen (dashboard/student-home.service.ts) ------- */

/**
 * One enrolled course as the Home screen needs it.
 *
 * Not a `DashboardResponse`: `progress` lives on `course`, and `studentName`
 * and the unread count belong to the student rather than to each course, so
 * the aggregate hoists them instead of repeating them N times.
 */
export interface StudentHomeEntry {
  course: CourseListItem;
  stats: DashboardStats;
  quickAccess: MaterialCounts;
  nextLiveSession: LiveSession | null;
  assessments: AssessmentListItem[];
}

export interface StudentHomeResponse {
  studentName: string;
  entries: StudentHomeEntry[];
  notifications: NotificationListResponse;
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
  | 'assessment_available'
  /**
   * Announcement fan-out (CLAUDE.md §5.14). Added by migration 005 on the
   * backend and missing here until 2026-09-08 - which was not a cosmetic gap:
   * both notification screens index an icon map by this union, so the first
   * announcement a student received rendered `<undefined />` and took the page
   * down with it.
   */
  | 'announcement';

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

/**
 * A staff directory row, from `GET /admin/assistants`. Mirrors
 * `manage/directory.service.ts` `StaffDirectoryEntry`.
 *
 * `role` is on the wire because the list holds two tiers - assistants and the
 * Full admin - and the course-staff picker must not offer to assign an admin,
 * whom `StaffService.assign` refuses. `scope`, `groupIds`, `status` and
 * `lastSeenAt` are absent from the response today: they are `PEOPLE-4`.
 */
export interface StaffDirectoryEntry extends DirectoryEntry {
  role: Role;
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

/**
 * Mirrors the backend's own `AuditAction` union
 * (`backend/src/audit/interfaces/audit-log-repository.interface.ts`).
 *
 * This list had drifted badly - it carried six of the backend's twenty-seven,
 * so the activity log rendered a blank label and no tone for every group
 * change, every authored assessment, every blog post, every announcement and
 * every live session. `Record<AuditAction, string>` cannot catch that, because
 * a union that is missing members is still perfectly satisfiable; the check
 * only fires in the other direction.
 *
 * There is no compile-time link between the two files, so **adding an action
 * on the backend means adding it here too** - the same hand-mirroring hazard
 * CLAUDE.md §5.4 describes for the DTO's runtime arrays, one process boundary
 * further out.
 */
export type AuditAction =
  | 'course_staff.assigned'
  | 'course_staff.unassigned'
  | 'submission.graded'
  | 'recording.created'
  | 'recording.updated'
  | 'recording.deleted'
  | 'live_session.scheduled'
  | 'live_session.updated'
  | 'live_session.cancelled'
  | 'announcement.posted'
  | 'group.created'
  | 'group.renamed'
  | 'group.course_added'
  | 'group.course_removed'
  | 'group.student_assigned'
  | 'group.student_removed'
  | 'assessment.created'
  | 'assessment.updated'
  | 'assessment.targeted'
  | 'assessment.deleted'
  | 'external_result.attached'
  | 'google.connected'
  | 'google.disconnected'
  | 'blog_post.created'
  | 'blog_post.updated'
  | 'blog_post.media_set'
  | 'blog_post.deleted';

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
  moduleCount: number;
  lessonCount: number;
  totalDurationSeconds: number;
}

export interface PublicCourseDetail extends PublicCourseSummary {
  modules: PublicOutlineModule[];
}

/* ------------------------------------------------------------------------
   Groups (CLAUDE.md §5.16) - the cohort a course is taught to.

   A group is a class of students studying **one** course. It used to carry no
   courseId, with a `GroupCourse` join row saying what it studied; migration 013
   collapsed that into a column, on the client's decision. Several groups can
   still study the same course.
   ------------------------------------------------------------------------ */

export interface Group {
  id: string;
  name: string;
  teacherId: string;
  courseId: string;

  /**
   * Who runs this group. **Display only - never render a permission from it.**
   * What an assistant may reach is decided server-side by `StaffScopeService`
   * from `assistant_group_assignments`, and the two are deliberately allowed to
   * disagree. Showing a control based on this field would be showing a control
   * the server then refuses - and hiding one is courtesy, never security.
   */
  assistantId: string | null;

  /** When the group meets, as free text - "Saturday 18:00". Not a schedule. */
  meets: string | null;
  room: string | null;

  createdAt: string;
}

/** One console row: the group, and how many sit in it. */
export interface GroupSummary extends Group {
  memberCount: number;
}

/**
 * The POST body. `name` and `courseId` are both required: a group IS a cohort
 * studying one named course (migration 013). `API_SPEC.yaml`'s `GroupWrite`.
 */
export interface GroupWrite {
  name: string;
  courseId: string;
  assistantId?: string | null;
  meets?: string | null;
  room?: string | null;
}

/**
 * The PATCH body. Every field optional; `null` clears a nullable one, and an
 * omitted field is left alone. `API_SPEC.yaml`'s `GroupPatch` - it used to be
 * called `GroupWrite` here, which named the create shape in the spec and the
 * edit shape in the browser (review F2A-5).
 */
export interface GroupPatch {
  name?: string;
  courseId?: string;
  assistantId?: string | null;
  meets?: string | null;
  room?: string | null;
}

/**
 * The *staff* roster row. Carries an email; §5.17's student-facing classmate
 * list deliberately does not, and the two come from different endpoints so
 * widening one cannot widen the other.
 */
export interface GroupMemberView {
  studentId: string;
  name: string;
  email: string;
  assignedBy: string;
  assignedAt: string;
}

/**
 * What a student may see of another student (§5.17): a name, and nothing else.
 * Never an email, a mark, progress or attendance - a classmate list that
 * carries a grade is a leaderboard, which is a different product decision.
 */
export interface Classmate {
  studentId: string;
  name: string;
}

/**
 * One of the caller's groups on this course, and who else is in it.
 *
 * A list of lists rather than one merged set: a student in two groups sees two
 * rosters, because merging them would invent a relationship between people who
 * have never met.
 */
export interface ClassmateGroup {
  groupId: string;
  groupName: string;
  classmates: Classmate[];
}

/* ------------------------------------------------------------------------
   Authoring (CLAUDE.md §5.18) and targeting (§5.16).

   A task is written **once** and aimed at one or more groups - the audience is
   per group, the task is not duplicated per group. So there is one assessment
   row, one target row per group, and §5.6's "average across all students"
   stays one average over one task.
   ------------------------------------------------------------------------ */

export interface AssessmentTarget {
  id: string;
  assessmentId: string;
  groupId: string;
  /** Overrides of the assessment's own window. Null means inherit. */
  availableFrom: string | null;
  availableTo: string | null;
  dueAt: string | null;
}

/** An assessment as the authoring screen sees it: the task and its audience. */
export interface AuthoredAssessment {
  id: string;
  courseId: string;
  lessonId: string | null;
  title: string;
  description: string;
  instructions: string;
  type: AssessmentType;
  topics: string[];
  availableFrom: string;
  availableTo: string;
  dueAt: string;
  maxScore: number;
  allowedFileTypes: string[];
  maxFileSizeBytes: number;
  createdAt: string;
  targets: AssessmentTarget[];
}

/** One targeted group, with the window override left out in the common case. */
export interface AssessmentTargetInput {
  groupId: string;
  availableFrom?: string;
  availableTo?: string;
  dueAt?: string;
}

/**
 * An announcement, as both the staff console and the student course page read
 * it. `audience` is the §6.1 wire form: `all_students`, `all_tas` or
 * `course:<id>`.
 */
export interface Announcement {
  id: string;
  audience: string;
  audienceType: 'all_students' | 'course' | 'all_tas';
  courseId: string | null;
  title: string;
  body: string;
  postedBy: string;
  postedAt: string;
  /** How many people it reached, counted at send time - never a stored list. */
  recipientCount: number;
}

/* ------------------------------------------------------------------------
   The blog (CLAUDE.md §5.19) - Dr. Tahir's achievements, authored by the
   teacher or an assistant and read by students and visitors alike.

   Two shapes, and the difference is what each reader is trusted with.
   `PublicBlogPost` is what the anonymous and student surfaces receive: no
   `authorId`, no `status`, no `isLive`. `StaffBlogPost` adds them, because the
   authoring console has to show drafts and know whose post it is.
   ------------------------------------------------------------------------ */

export type BlogCategory = 'achievement' | 'article' | 'resource';
export type BlogPostStatus = 'draft' | 'scheduled' | 'published';

/** How the page renders an item: an <img>, a player, or a download link. */
export type BlogMediaKind = 'image' | 'video' | 'file';

export interface BlogMedia {
  id: string;
  postId: string;
  kind: BlogMediaKind;
  url: string;
  /** The per-item description. */
  caption: string | null;
  /** Null for externally-hosted media - we record only what we determined. */
  mimeType: string | null;
  sizeBytes: number | null;
  position: number;
  createdAt: string;
}

export interface PublicBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  category: BlogCategory;
  tags: string[];
  publishAt: string;
  createdAt: string;
  updatedAt: string;
  /** The byline. Resolved server-side so no client joins a user id. */
  authorName: string;
  /** `excerpt`, or the opening of `body` when there is none. */
  summary: string;
  media: BlogMedia[];
}

export interface StaffBlogPost extends PublicBlogPost {
  authorId: string;
  status: BlogPostStatus;
  /**
   * Whether it is visible to a reader **right now** - derived server-side,
   * never stored. A `scheduled` post whose time has passed is live and the row
   * still says `scheduled`, because nothing rewrites it; this is the field
   * that tells them apart.
   */
  isLive: boolean;
}

/** One gallery item as the authoring form sends it. Position is the array's. */
export interface BlogMediaInput {
  kind: BlogMediaKind;
  url: string;
  caption?: string;
  mimeType?: string;
  sizeBytes?: number;
}

/** What `POST /staff/uploads` answers with, ready to become a `BlogMediaInput`. */
export interface UploadResult {
  url: string;
  sizeBytes: number;
  mimeType: string;
  kind: BlogMediaKind;
}

/**
 * Whether this server accepts uploads at all. `STORAGE_DRIVER=none` is the
 * production default, so the form renders a URL field instead of a file picker
 * rather than offering one that 503s.
 */
export interface UploadConfig {
  enabled: boolean;
  maxBytes: number;
  allowedMimeTypes: string[];
}
