/**
 * `OPS-1` (ruling `D-52`): the frontend mirror, held to the backend by the
 * compiler. Run by `npm run typecheck:drift` and in CI; a mismatch in EITHER
 * direction is a compile error on the `Check_*` line that names the type.
 *
 * Not generated from `API_SPEC.yaml`: that file specifies only the routes the
 * redesign adds or changes (its header), so it cannot vouch for the rest.
 * The backend's own types are the thing the mirror copies, so they are what
 * it is checked against.
 *
 * The comparison is on the WIRE form of the backend type (`Wire<T>`): a string
 * enum member travels as its string, so `Role.Teacher` and `'teacher'` are the
 * same value on both sides. Otherwise it is mutual assignability - a union
 * member, or a required field, missing on either side fails. An OPTIONAL field
 * present on one side only does not fail; that is the known limit.
 *
 * COVERAGE, stated rather than implied (119 of 139 mirror types):
 * - Checked: every `lib/types.ts` export with a backend counterpart, below.
 * - Excluded, with the reason:
 *   - `TaskDraftUpdate`: a request body. Its contract is `UpdateTaskDraftDto`,
 *     validated at the boundary; the same-named backend type is the
 *     repository patch, which carries stored attachments.
 * - No backend type to compare against (19) - request bodies whose
 *   contract is a DTO class, and view shapes the backend builds inline:
 *   `AdminCourse` `AdminCourseWrite` `AdminCoursePatch` `AppNotification`
 *   `Annotation` `AnnotationWrite` `StaffRecording` `AdminStudentUpdate`
 *   `AssistantWrite` `AssessmentTargetInput` `AttachmentInput` `TaskDraft`
 *   `TaskDraftWrite` `PublicBlogPost` `StaffBlogPost` `BlogMediaInput`
 *   `UploadConfig` `StaffProfile` `GoogleCompletion`
 *   A backend type exported for any of these should be added here.
 *
 * Found on its first run, and fixed in the same change: the mirror's
 * `AuditAction` lacked `announcement.created/updated/deleted` and
 * `group.updated`, so the activity log rendered those entries unlabelled - the
 * exact defect CLAUDE.md §6 cites; `Assistant.role` was wider than the
 * backend's; `Markbook.omittedTasks[].workType` was `string` on the
 * backend; and `AuditLogEntry.targetType` was a bare `string`, now the
 * mirrored `AuditTargetType` union.
 */

import type { Role as BackendRole } from '../../src/auth/roles.enum.js';

/** The JSON a backend value becomes: string enum members travel as their strings. */
// Homomorphic, so arrays and tuples (an annotation point is `[x, y]`) keep their shape.
type Wire<T> = T extends BackendRole
  ? `${T}`
  : T extends object
    ? { [K in keyof T]: Wire<T[K]> }
    : T;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

import type { Role as B_Role } from '../../src/auth/roles.enum.js';
import type { AuthenticatedUser as B_AuthenticatedUser } from '../../src/auth/auth.service.js';
import type { AuthResult as B_AuthResult } from '../../src/auth/auth.service.js';
import type { UserStatus as B_UserStatus } from '../../src/auth/interfaces/user-repository.interface.js';
import type { RegistrationResult as B_RegistrationResult } from '../../src/auth/auth.service.js';
import type { Lesson as B_Lesson } from '../../src/courses/interfaces/course-repository.interface.js';
import type { CourseModule as B_CourseModule } from '../../src/courses/interfaces/course-repository.interface.js';
import type { CompletionCheckpoint as B_CompletionCheckpoint } from '../../src/courses/courses.service.js';
import type { AttendanceEntry as B_AttendanceEntry } from '../../src/courses/courses.service.js';
import type { CourseProgress as B_CourseProgress } from '../../src/courses/courses.service.js';
import type { CourseListItem as B_CourseListItem } from '../../src/courses/courses.service.js';
import type { CourseDetail as B_CourseDetail } from '../../src/courses/courses.service.js';
import type { CatalogItem as B_CatalogItem } from '../../src/courses/courses.service.js';
import type { LiveSession as B_LiveSession } from '../../src/live-sessions/interfaces/live-session-repository.interface.js';
import type { LiveSessionWithAttendance as B_LiveSessionWithAttendance } from '../../src/live-sessions/interfaces/live-session-repository.interface.js';
import type { LiveSessionListResponse as B_LiveSessionListResponse } from '../../src/live-sessions/live-sessions.service.js';
import type { MaterialCategory as B_MaterialCategory } from '../../src/materials/interfaces/material-repository.interface.js';
import type { Material as B_Material } from '../../src/materials/interfaces/material-repository.interface.js';
import type { MaterialsByCategory as B_MaterialsByCategory } from '../../src/materials/materials.service.js';
import type { MaterialCounts as B_MaterialCounts } from '../../src/materials/materials.service.js';
import type { Recording as B_Recording } from '../../src/recordings/interfaces/recording-repository.interface.js';
import type { RecordingWithProgress as B_RecordingWithProgress } from '../../src/recordings/interfaces/recording-repository.interface.js';
import type { RecordingListResponse as B_RecordingListResponse } from '../../src/recordings/recordings.service.js';
import type { RecordingProgress as B_RecordingProgress } from '../../src/recordings/interfaces/recording-repository.interface.js';
import type { AssessmentType as B_AssessmentType } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { WorkType as B_WorkType } from '../../src/assessments/interfaces/work-repository.interface.js';
import type { TaskVisibility as B_TaskVisibility } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { VisibilityState as B_VisibilityState } from '../../src/manage/assessment-authoring.service.js';
import type { StaffTaskStatus as B_StaffTaskStatus } from '../../src/manage/assessment-authoring.service.js';
import type { SubmissionMode as B_SubmissionMode } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { AssessmentStatus as B_AssessmentStatus } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { AssessmentListItem as B_AssessmentListItem } from '../../src/assessments/assessments.service.js';
import type { SubmissionFile as B_SubmissionFile } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { SubmissionRevision as B_SubmissionRevision } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { SubmissionView as B_SubmissionView } from '../../src/assessments/assessments.service.js';
import type { AssessmentDetail as B_AssessmentDetail } from '../../src/assessments/assessments.service.js';
import type { WorkExpectation as B_WorkExpectation } from '../../src/assessments/assessments.service.js';
import type { DashboardStats as B_DashboardStats } from '../../src/dashboard/dashboard.service.js';
import type { DashboardResponse as B_DashboardResponse } from '../../src/dashboard/dashboard.service.js';
import type { StudentHomeEntry as B_StudentHomeEntry } from '../../src/dashboard/student-home.service.js';
import type { StudentHomeResponse as B_StudentHomeResponse } from '../../src/dashboard/student-home.service.js';
import type { TopicScore as B_TopicScore } from '../../src/reports/reports.service.js';
import type { PerformanceSnapshot as B_PerformanceSnapshot } from '../../src/reports/reports.service.js';
import type { ReportSummary as B_ReportSummary } from '../../src/reports/reports.service.js';
import type { ReportDocument as B_ReportDocument } from '../../src/reports/interfaces/report-repository.interface.js';
import type { NotificationType as B_NotificationType } from '../../src/notifications/interfaces/notification-repository.interface.js';
import type { NotificationListResponse as B_NotificationListResponse } from '../../src/notifications/notifications.service.js';
import type { StudentProfileView as B_StudentProfile } from '../../src/students/students.service.js';
import type { ManageScope as B_ManageScope } from '../../src/manage/manage.service.js';
import type { StaffCourseSummary as B_StaffCourseSummary } from '../../src/staff/staff.service.js';
import type { ManageCourseCard as B_ManageCourseCard } from '../../src/manage/manage.service.js';
import type { ManageOverview as B_ManageOverview } from '../../src/manage/manage.service.js';
import type { RosterEntry as B_RosterEntry } from '../../src/manage/manage.service.js';
import type { CourseRosterResponse as B_CourseRosterResponse } from '../../src/manage/manage.service.js';
import type { OutlineLesson as B_OutlineLesson } from '../../src/manage/manage.service.js';
import type { OutlineModule as B_OutlineModule } from '../../src/manage/manage.service.js';
import type { GradingStatus as B_GradingStatus } from '../../src/manage/grading.service.js';
import type { GradingQueueItem as B_GradingQueueItem } from '../../src/manage/grading.service.js';
import type { MirroredStatus as B_MirroredStatus } from '../../src/groups/groups.service.js';
import type { MarkbookTask as B_MarkbookTask } from '../../src/groups/groups.service.js';
import type { MarkbookCell as B_MarkbookCell } from '../../src/groups/groups.service.js';
import type { MarkbookStudent as B_MarkbookStudent } from '../../src/groups/groups.service.js';
import type { Markbook as B_Markbook } from '../../src/groups/groups.service.js';
import type { AnnotationKind as B_AnnotationKind } from '../../src/assessments/interfaces/submission-annotation-repository.interface.js';
import type { AnnotationPoint as B_AnnotationPoint } from '../../src/assessments/interfaces/submission-annotation-repository.interface.js';
import type { StudentAnnotation as B_StudentAnnotation } from '../../src/assessments/assessments.service.js';
import type { AnnotationPatch as B_AnnotationPatch } from '../../src/assessments/interfaces/submission-annotation-repository.interface.js';
import type { SubmissionStatus as B_SubmissionStatus } from '../../src/assessments/assessments.service.js';
import type { SubmissionDocument as B_SubmissionDocument } from '../../src/manage/marking.service.js';
import type { TaskSubmissionRow as B_TaskSubmissionRow } from '../../src/manage/marking.service.js';
import type { TaskSubmissionGroup as B_TaskSubmissionGroup } from '../../src/manage/marking.service.js';
import type { TaskSubmissions as B_TaskSubmissions } from '../../src/manage/marking.service.js';
import type { AssessmentAverage as B_AssessmentAverage } from '../../src/manage/grading.service.js';
import type { GradingQueueResponse as B_GradingQueueResponse } from '../../src/manage/grading.service.js';
import type { DirectoryEntry as B_DirectoryEntry } from '../../src/manage/directory.service.js';
import type { StudentDirectoryEntry as B_StudentDirectoryEntry } from '../../src/manage/directory.service.js';
import type { StudentDetail as B_StudentDetail } from '../../src/manage/admin-students.service.js';
import type { CreateStudentInput as B_CreateStudentInput } from '../../src/manage/admin-students.service.js';
import type { AssistantScope as B_AssistantScope } from '../../src/staff/interfaces/assistant-scope-repository.interface.js';
import type { Assistant as B_Assistant } from '../../src/manage/admin-assistants.service.js';
import type { AuditTargetType as B_AuditTargetType } from '../../src/audit/interfaces/audit-log-repository.interface.js';
import type { AuditAction as B_AuditAction } from '../../src/audit/interfaces/audit-log-repository.interface.js';
import type { AuditLogEntry as B_AuditLogEntry } from '../../src/audit/interfaces/audit-log-repository.interface.js';
import type { AuditLogPage as B_AuditLogPage } from '../../src/audit/interfaces/audit-log-repository.interface.js';
import type { PublicOutlineLesson as B_PublicOutlineLesson } from '../../src/public/public-courses.service.js';
import type { PublicOutlineModule as B_PublicOutlineModule } from '../../src/public/public-courses.service.js';
import type { PublicCourseSummary as B_PublicCourseSummary } from '../../src/public/public-courses.service.js';
import type { PublicCourseDetail as B_PublicCourseDetail } from '../../src/public/public-courses.service.js';
import type { Group as B_Group } from '../../src/groups/interfaces/group-repository.interface.js';
import type { GroupSummary as B_GroupSummary } from '../../src/groups/groups.service.js';
import type { GroupWrite as B_GroupWrite } from '../../src/groups/groups.service.js';
import type { GroupPatch as B_GroupPatch } from '../../src/groups/interfaces/group-repository.interface.js';
import type { GroupReportEntry as B_GroupReportEntry } from '../../src/groups/groups.service.js';
import type { GroupReport as B_GroupReport } from '../../src/groups/groups.service.js';
import type { GroupMemberView as B_GroupMemberView } from '../../src/groups/groups.service.js';
import type { Classmate as B_Classmate } from '../../src/groups/classmates.service.js';
import type { ClassmateGroup as B_ClassmateGroup } from '../../src/groups/classmates.service.js';
import type { AssessmentTarget as B_AssessmentTarget } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { AuthoredAssessment as B_AuthoredAssessment } from '../../src/manage/assessment-authoring.service.js';
import type { StaffTaskTarget as B_StaffTaskTarget } from '../../src/manage/assessment-authoring.service.js';
import type { StaffTask as B_StaffTask } from '../../src/manage/assessment-authoring.service.js';
import type { Attachment as B_Attachment } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { AttachmentAudience as B_AttachmentAudience } from '../../src/assessments/interfaces/assessment-repository.interface.js';
import type { Announcement as B_Announcement } from '../../src/announcements/interfaces/announcement-repository.interface.js';
import type { BlogCategory as B_BlogCategory } from '../../src/blog/interfaces/blog-repository.interface.js';
import type { BlogPostStatus as B_BlogPostStatus } from '../../src/blog/interfaces/blog-repository.interface.js';
import type { BlogMediaKind as B_BlogMediaKind } from '../../src/blog/interfaces/blog-repository.interface.js';
import type { BlogMedia as B_BlogMedia } from '../../src/blog/interfaces/blog-repository.interface.js';
import type { UploadKind as B_UploadKind } from '../../src/common/storage/upload-types.js';
import type { UploadResult as B_UploadResult } from '../../src/common/storage/uploads.service.js';
import type { WorkStatus as B_WorkStatus } from '../../src/assessments/work-analytics.service.js';
import type { WorkAnalytics as B_WorkAnalytics } from '../../src/assessments/work-analytics.service.js';
import type { StudentWorkRow as B_StudentWorkRow } from '../../src/assessments/work-analytics.service.js';
import type { ExternalResult as B_ExternalResult } from '../../src/assessments/interfaces/work-repository.interface.js';
import type { SyncOutcome as B_SyncOutcome } from '../../src/assessments/google-form-sync.service.js';
import type { StudentWorkResult as B_StudentWorkResult } from '../../src/assessments/work-analytics.service.js';
import type { NotificationPreferences as B_NotificationPreferences } from '../../src/settings/interfaces/notification-preferences-repository.interface.js';
import type { GoogleStart as B_GoogleStart } from '../../src/auth/google/google-sign-in.service.js';
import type { GoogleLinkStatus as B_GoogleLinkStatus } from '../../src/auth/google/google-sign-in.service.js';
import type {
  Role as F_Role,
  AuthenticatedUser as F_AuthenticatedUser,
  AuthResult as F_AuthResult,
  UserStatus as F_UserStatus,
  RegistrationResult as F_RegistrationResult,
  Lesson as F_Lesson,
  CourseModule as F_CourseModule,
  CompletionCheckpoint as F_CompletionCheckpoint,
  AttendanceEntry as F_AttendanceEntry,
  CourseProgress as F_CourseProgress,
  CourseListItem as F_CourseListItem,
  CourseDetail as F_CourseDetail,
  CatalogItem as F_CatalogItem,
  LiveSession as F_LiveSession,
  LiveSessionWithAttendance as F_LiveSessionWithAttendance,
  LiveSessionListResponse as F_LiveSessionListResponse,
  MaterialCategory as F_MaterialCategory,
  Material as F_Material,
  MaterialsByCategory as F_MaterialsByCategory,
  MaterialCounts as F_MaterialCounts,
  Recording as F_Recording,
  RecordingWithProgress as F_RecordingWithProgress,
  RecordingListResponse as F_RecordingListResponse,
  RecordingProgress as F_RecordingProgress,
  AssessmentType as F_AssessmentType,
  WorkType as F_WorkType,
  TaskVisibility as F_TaskVisibility,
  VisibilityState as F_VisibilityState,
  StaffTaskStatus as F_StaffTaskStatus,
  SubmissionMode as F_SubmissionMode,
  AssessmentStatus as F_AssessmentStatus,
  AssessmentListItem as F_AssessmentListItem,
  SubmissionFile as F_SubmissionFile,
  SubmissionRevision as F_SubmissionRevision,
  SubmissionView as F_SubmissionView,
  AssessmentDetail as F_AssessmentDetail,
  WorkExpectation as F_WorkExpectation,
  DashboardStats as F_DashboardStats,
  DashboardResponse as F_DashboardResponse,
  StudentHomeEntry as F_StudentHomeEntry,
  StudentHomeResponse as F_StudentHomeResponse,
  TopicScore as F_TopicScore,
  PerformanceSnapshot as F_PerformanceSnapshot,
  ReportSummary as F_ReportSummary,
  ReportDocument as F_ReportDocument,
  NotificationType as F_NotificationType,
  NotificationListResponse as F_NotificationListResponse,
  StudentProfile as F_StudentProfile,
  ManageScope as F_ManageScope,
  StaffCourseSummary as F_StaffCourseSummary,
  ManageCourseCard as F_ManageCourseCard,
  ManageOverview as F_ManageOverview,
  RosterEntry as F_RosterEntry,
  CourseRosterResponse as F_CourseRosterResponse,
  OutlineLesson as F_OutlineLesson,
  OutlineModule as F_OutlineModule,
  GradingStatus as F_GradingStatus,
  GradingQueueItem as F_GradingQueueItem,
  MirroredStatus as F_MirroredStatus,
  MarkbookTask as F_MarkbookTask,
  MarkbookCell as F_MarkbookCell,
  MarkbookStudent as F_MarkbookStudent,
  Markbook as F_Markbook,
  AnnotationKind as F_AnnotationKind,
  AnnotationPoint as F_AnnotationPoint,
  StudentAnnotation as F_StudentAnnotation,
  AnnotationPatch as F_AnnotationPatch,
  SubmissionStatus as F_SubmissionStatus,
  SubmissionDocument as F_SubmissionDocument,
  TaskSubmissionRow as F_TaskSubmissionRow,
  TaskSubmissionGroup as F_TaskSubmissionGroup,
  TaskSubmissions as F_TaskSubmissions,
  AssessmentAverage as F_AssessmentAverage,
  GradingQueueResponse as F_GradingQueueResponse,
  DirectoryEntry as F_DirectoryEntry,
  StudentDirectoryEntry as F_StudentDirectoryEntry,
  StudentDetail as F_StudentDetail,
  CreateStudentInput as F_CreateStudentInput,
  AssistantScope as F_AssistantScope,
  Assistant as F_Assistant,
  AuditAction as F_AuditAction,
  AuditTargetType as F_AuditTargetType,
  AuditLogEntry as F_AuditLogEntry,
  AuditLogPage as F_AuditLogPage,
  PublicOutlineLesson as F_PublicOutlineLesson,
  PublicOutlineModule as F_PublicOutlineModule,
  PublicCourseSummary as F_PublicCourseSummary,
  PublicCourseDetail as F_PublicCourseDetail,
  Group as F_Group,
  GroupSummary as F_GroupSummary,
  GroupWrite as F_GroupWrite,
  GroupPatch as F_GroupPatch,
  GroupReportEntry as F_GroupReportEntry,
  GroupReport as F_GroupReport,
  GroupMemberView as F_GroupMemberView,
  Classmate as F_Classmate,
  ClassmateGroup as F_ClassmateGroup,
  AssessmentTarget as F_AssessmentTarget,
  AuthoredAssessment as F_AuthoredAssessment,
  StaffTaskTarget as F_StaffTaskTarget,
  StaffTask as F_StaffTask,
  Attachment as F_Attachment,
  AttachmentAudience as F_AttachmentAudience,
  Announcement as F_Announcement,
  BlogCategory as F_BlogCategory,
  BlogPostStatus as F_BlogPostStatus,
  BlogMediaKind as F_BlogMediaKind,
  BlogMedia as F_BlogMedia,
  UploadKind as F_UploadKind,
  UploadResult as F_UploadResult,
  WorkStatus as F_WorkStatus,
  WorkAnalytics as F_WorkAnalytics,
  StudentWorkRow as F_StudentWorkRow,
  ExternalResult as F_ExternalResult,
  SyncOutcome as F_SyncOutcome,
  StudentWorkResult as F_StudentWorkResult,
  NotificationPreferences as F_NotificationPreferences,
  GoogleStart as F_GoogleStart,
  GoogleLinkStatus as F_GoogleLinkStatus,
} from '../../../frontend/lib/types.js';

export type Check_Role = Assert<Same<Wire<B_Role>, F_Role>>;
export type Check_AuthenticatedUser = Assert<Same<Wire<B_AuthenticatedUser>, F_AuthenticatedUser>>;
export type Check_AuthResult = Assert<Same<Wire<B_AuthResult>, F_AuthResult>>;
export type Check_UserStatus = Assert<Same<Wire<B_UserStatus>, F_UserStatus>>;
export type Check_RegistrationResult = Assert<Same<Wire<B_RegistrationResult>, F_RegistrationResult>>;
export type Check_Lesson = Assert<Same<Wire<B_Lesson>, F_Lesson>>;
export type Check_CourseModule = Assert<Same<Wire<B_CourseModule>, F_CourseModule>>;
export type Check_CompletionCheckpoint = Assert<Same<Wire<B_CompletionCheckpoint>, F_CompletionCheckpoint>>;
export type Check_AttendanceEntry = Assert<Same<Wire<B_AttendanceEntry>, F_AttendanceEntry>>;
export type Check_CourseProgress = Assert<Same<Wire<B_CourseProgress>, F_CourseProgress>>;
export type Check_CourseListItem = Assert<Same<Wire<B_CourseListItem>, F_CourseListItem>>;
export type Check_CourseDetail = Assert<Same<Wire<B_CourseDetail>, F_CourseDetail>>;
export type Check_CatalogItem = Assert<Same<Wire<B_CatalogItem>, F_CatalogItem>>;
export type Check_LiveSession = Assert<Same<Wire<B_LiveSession>, F_LiveSession>>;
export type Check_LiveSessionWithAttendance = Assert<Same<Wire<B_LiveSessionWithAttendance>, F_LiveSessionWithAttendance>>;
export type Check_LiveSessionListResponse = Assert<Same<Wire<B_LiveSessionListResponse>, F_LiveSessionListResponse>>;
export type Check_MaterialCategory = Assert<Same<Wire<B_MaterialCategory>, F_MaterialCategory>>;
export type Check_Material = Assert<Same<Wire<B_Material>, F_Material>>;
export type Check_MaterialsByCategory = Assert<Same<Wire<B_MaterialsByCategory>, F_MaterialsByCategory>>;
export type Check_MaterialCounts = Assert<Same<Wire<B_MaterialCounts>, F_MaterialCounts>>;
export type Check_Recording = Assert<Same<Wire<B_Recording>, F_Recording>>;
export type Check_RecordingWithProgress = Assert<Same<Wire<B_RecordingWithProgress>, F_RecordingWithProgress>>;
export type Check_RecordingListResponse = Assert<Same<Wire<B_RecordingListResponse>, F_RecordingListResponse>>;
export type Check_RecordingProgress = Assert<Same<Wire<B_RecordingProgress>, F_RecordingProgress>>;
export type Check_AssessmentType = Assert<Same<Wire<B_AssessmentType>, F_AssessmentType>>;
export type Check_WorkType = Assert<Same<Wire<B_WorkType>, F_WorkType>>;
export type Check_TaskVisibility = Assert<Same<Wire<B_TaskVisibility>, F_TaskVisibility>>;
export type Check_VisibilityState = Assert<Same<Wire<B_VisibilityState>, F_VisibilityState>>;
export type Check_StaffTaskStatus = Assert<Same<Wire<B_StaffTaskStatus>, F_StaffTaskStatus>>;
export type Check_SubmissionMode = Assert<Same<Wire<B_SubmissionMode>, F_SubmissionMode>>;
export type Check_AssessmentStatus = Assert<Same<Wire<B_AssessmentStatus>, F_AssessmentStatus>>;
export type Check_AssessmentListItem = Assert<Same<Wire<B_AssessmentListItem>, F_AssessmentListItem>>;
export type Check_SubmissionFile = Assert<Same<Wire<B_SubmissionFile>, F_SubmissionFile>>;
export type Check_SubmissionRevision = Assert<Same<Wire<B_SubmissionRevision>, F_SubmissionRevision>>;
export type Check_SubmissionView = Assert<Same<Wire<B_SubmissionView>, F_SubmissionView>>;
export type Check_AssessmentDetail = Assert<Same<Wire<B_AssessmentDetail>, F_AssessmentDetail>>;
export type Check_WorkExpectation = Assert<Same<Wire<B_WorkExpectation>, F_WorkExpectation>>;
export type Check_DashboardStats = Assert<Same<Wire<B_DashboardStats>, F_DashboardStats>>;
export type Check_DashboardResponse = Assert<Same<Wire<B_DashboardResponse>, F_DashboardResponse>>;
export type Check_StudentHomeEntry = Assert<Same<Wire<B_StudentHomeEntry>, F_StudentHomeEntry>>;
export type Check_StudentHomeResponse = Assert<Same<Wire<B_StudentHomeResponse>, F_StudentHomeResponse>>;
export type Check_TopicScore = Assert<Same<Wire<B_TopicScore>, F_TopicScore>>;
export type Check_PerformanceSnapshot = Assert<Same<Wire<B_PerformanceSnapshot>, F_PerformanceSnapshot>>;
export type Check_ReportSummary = Assert<Same<Wire<B_ReportSummary>, F_ReportSummary>>;
export type Check_ReportDocument = Assert<Same<Wire<B_ReportDocument>, F_ReportDocument>>;
export type Check_NotificationType = Assert<Same<Wire<B_NotificationType>, F_NotificationType>>;
export type Check_NotificationListResponse = Assert<Same<Wire<B_NotificationListResponse>, F_NotificationListResponse>>;
export type Check_StudentProfile = Assert<Same<Wire<B_StudentProfile>, F_StudentProfile>>;
export type Check_ManageScope = Assert<Same<Wire<B_ManageScope>, F_ManageScope>>;
export type Check_StaffCourseSummary = Assert<Same<Wire<B_StaffCourseSummary>, F_StaffCourseSummary>>;
export type Check_ManageCourseCard = Assert<Same<Wire<B_ManageCourseCard>, F_ManageCourseCard>>;
export type Check_ManageOverview = Assert<Same<Wire<B_ManageOverview>, F_ManageOverview>>;
export type Check_RosterEntry = Assert<Same<Wire<B_RosterEntry>, F_RosterEntry>>;
export type Check_CourseRosterResponse = Assert<Same<Wire<B_CourseRosterResponse>, F_CourseRosterResponse>>;
export type Check_OutlineLesson = Assert<Same<Wire<B_OutlineLesson>, F_OutlineLesson>>;
export type Check_OutlineModule = Assert<Same<Wire<B_OutlineModule>, F_OutlineModule>>;
export type Check_GradingStatus = Assert<Same<Wire<B_GradingStatus>, F_GradingStatus>>;
export type Check_GradingQueueItem = Assert<Same<Wire<B_GradingQueueItem>, F_GradingQueueItem>>;
export type Check_MirroredStatus = Assert<Same<Wire<B_MirroredStatus>, F_MirroredStatus>>;
export type Check_MarkbookTask = Assert<Same<Wire<B_MarkbookTask>, F_MarkbookTask>>;
export type Check_MarkbookCell = Assert<Same<Wire<B_MarkbookCell>, F_MarkbookCell>>;
export type Check_MarkbookStudent = Assert<Same<Wire<B_MarkbookStudent>, F_MarkbookStudent>>;
export type Check_Markbook = Assert<Same<Wire<B_Markbook>, F_Markbook>>;
export type Check_AnnotationKind = Assert<Same<Wire<B_AnnotationKind>, F_AnnotationKind>>;
export type Check_AnnotationPoint = Assert<Same<Wire<B_AnnotationPoint>, F_AnnotationPoint>>;
export type Check_StudentAnnotation = Assert<Same<Wire<B_StudentAnnotation>, F_StudentAnnotation>>;
export type Check_AnnotationPatch = Assert<Same<Wire<B_AnnotationPatch>, F_AnnotationPatch>>;
export type Check_SubmissionStatus = Assert<Same<Wire<B_SubmissionStatus>, F_SubmissionStatus>>;
export type Check_SubmissionDocument = Assert<Same<Wire<B_SubmissionDocument>, F_SubmissionDocument>>;
export type Check_TaskSubmissionRow = Assert<Same<Wire<B_TaskSubmissionRow>, F_TaskSubmissionRow>>;
export type Check_TaskSubmissionGroup = Assert<Same<Wire<B_TaskSubmissionGroup>, F_TaskSubmissionGroup>>;
export type Check_TaskSubmissions = Assert<Same<Wire<B_TaskSubmissions>, F_TaskSubmissions>>;
export type Check_AssessmentAverage = Assert<Same<Wire<B_AssessmentAverage>, F_AssessmentAverage>>;
export type Check_GradingQueueResponse = Assert<Same<Wire<B_GradingQueueResponse>, F_GradingQueueResponse>>;
export type Check_DirectoryEntry = Assert<Same<Wire<B_DirectoryEntry>, F_DirectoryEntry>>;
export type Check_StudentDirectoryEntry = Assert<Same<Wire<B_StudentDirectoryEntry>, F_StudentDirectoryEntry>>;
export type Check_StudentDetail = Assert<Same<Wire<B_StudentDetail>, F_StudentDetail>>;
export type Check_CreateStudentInput = Assert<Same<Wire<B_CreateStudentInput>, F_CreateStudentInput>>;
export type Check_AssistantScope = Assert<Same<Wire<B_AssistantScope>, F_AssistantScope>>;
export type Check_Assistant = Assert<Same<Wire<B_Assistant>, F_Assistant>>;
export type Check_AuditTargetType = Assert<Same<Wire<B_AuditTargetType>, F_AuditTargetType>>;
export type Check_AuditAction = Assert<Same<Wire<B_AuditAction>, F_AuditAction>>;
export type Check_AuditLogEntry = Assert<Same<Wire<B_AuditLogEntry>, F_AuditLogEntry>>;
export type Check_AuditLogPage = Assert<Same<Wire<B_AuditLogPage>, F_AuditLogPage>>;
export type Check_PublicOutlineLesson = Assert<Same<Wire<B_PublicOutlineLesson>, F_PublicOutlineLesson>>;
export type Check_PublicOutlineModule = Assert<Same<Wire<B_PublicOutlineModule>, F_PublicOutlineModule>>;
export type Check_PublicCourseSummary = Assert<Same<Wire<B_PublicCourseSummary>, F_PublicCourseSummary>>;
export type Check_PublicCourseDetail = Assert<Same<Wire<B_PublicCourseDetail>, F_PublicCourseDetail>>;
export type Check_Group = Assert<Same<Wire<B_Group>, F_Group>>;
export type Check_GroupSummary = Assert<Same<Wire<B_GroupSummary>, F_GroupSummary>>;
export type Check_GroupWrite = Assert<Same<Wire<B_GroupWrite>, F_GroupWrite>>;
export type Check_GroupPatch = Assert<Same<Wire<B_GroupPatch>, F_GroupPatch>>;
export type Check_GroupReportEntry = Assert<Same<Wire<B_GroupReportEntry>, F_GroupReportEntry>>;
export type Check_GroupReport = Assert<Same<Wire<B_GroupReport>, F_GroupReport>>;
export type Check_GroupMemberView = Assert<Same<Wire<B_GroupMemberView>, F_GroupMemberView>>;
export type Check_Classmate = Assert<Same<Wire<B_Classmate>, F_Classmate>>;
export type Check_ClassmateGroup = Assert<Same<Wire<B_ClassmateGroup>, F_ClassmateGroup>>;
export type Check_AssessmentTarget = Assert<Same<Wire<B_AssessmentTarget>, F_AssessmentTarget>>;
export type Check_AuthoredAssessment = Assert<Same<Wire<B_AuthoredAssessment>, F_AuthoredAssessment>>;
export type Check_StaffTaskTarget = Assert<Same<Wire<B_StaffTaskTarget>, F_StaffTaskTarget>>;
export type Check_StaffTask = Assert<Same<Wire<B_StaffTask>, F_StaffTask>>;
export type Check_Attachment = Assert<Same<Wire<B_Attachment>, F_Attachment>>;
export type Check_AttachmentAudience = Assert<Same<Wire<B_AttachmentAudience>, F_AttachmentAudience>>;
export type Check_Announcement = Assert<Same<Wire<B_Announcement>, F_Announcement>>;
export type Check_BlogCategory = Assert<Same<Wire<B_BlogCategory>, F_BlogCategory>>;
export type Check_BlogPostStatus = Assert<Same<Wire<B_BlogPostStatus>, F_BlogPostStatus>>;
export type Check_BlogMediaKind = Assert<Same<Wire<B_BlogMediaKind>, F_BlogMediaKind>>;
export type Check_BlogMedia = Assert<Same<Wire<B_BlogMedia>, F_BlogMedia>>;
export type Check_UploadKind = Assert<Same<Wire<B_UploadKind>, F_UploadKind>>;
export type Check_UploadResult = Assert<Same<Wire<B_UploadResult>, F_UploadResult>>;
export type Check_WorkStatus = Assert<Same<Wire<B_WorkStatus>, F_WorkStatus>>;
export type Check_WorkAnalytics = Assert<Same<Wire<B_WorkAnalytics>, F_WorkAnalytics>>;
export type Check_StudentWorkRow = Assert<Same<Wire<B_StudentWorkRow>, F_StudentWorkRow>>;
export type Check_ExternalResult = Assert<Same<Wire<B_ExternalResult>, F_ExternalResult>>;
export type Check_SyncOutcome = Assert<Same<Wire<B_SyncOutcome>, F_SyncOutcome>>;
export type Check_StudentWorkResult = Assert<Same<Wire<B_StudentWorkResult>, F_StudentWorkResult>>;
export type Check_NotificationPreferences = Assert<Same<Wire<B_NotificationPreferences>, F_NotificationPreferences>>;
export type Check_GoogleStart = Assert<Same<Wire<B_GoogleStart>, F_GoogleStart>>;
export type Check_GoogleLinkStatus = Assert<Same<Wire<B_GoogleLinkStatus>, F_GoogleLinkStatus>>;
