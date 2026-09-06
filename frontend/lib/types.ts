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
