import type {
  Announcement,
  AssessmentDetail,
  AssessmentListItem,
  AssessmentTargetInput,
  AuthoredAssessment,
  AuditLogPage,
  AuthResult,
  CatalogItem,
  ClassmateGroup,
  CourseDetail,
  CourseListItem,
  CourseRosterResponse,
  CourseStaffMember,
  DashboardResponse,
  DirectoryEntry,
  GradingQueueItem,
  GradingQueueResponse,
  GradingStatus,
  Group,
  GroupCourse,
  GroupMemberView,
  GroupSummary,
  LearningMode,
  LiveSession,
  LiveSessionListResponse,
  ManageOverview,
  MaterialCategory,
  MaterialsByCategory,
  NotificationListResponse,
  OutlineModule,
  PublicCourseDetail,
  PublicCourseSummary,
  RecordingListResponse,
  RecordingProgress,
  ReportDocument,
  ReportSummary,
  StaffCourseSummary,
  StaffRecording,
  StudentDirectoryEntry,
  StudentHomeResponse,
  StudentProfile,
  AppNotification,
} from './types';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * A failed request the UI can render. `status` is what separates "your session
 * expired" from "that course does not exist" from "the API is down", and each
 * of those is a different screen.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isAuth() {
    return this.status === 401 || this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  /** No response at all - the API is unreachable, not refusing. */
  get isOffline() {
    return this.status === 0;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  /** Server Components pass this; the browser client leaves it alone. */
  cache?: RequestCache;
  /**
   * Seconds to cache a Server Component read for. Only the public marketing
   * pages set it - everything else is per-student and must never be shared
   * between two readers, which is why `cache` defaults to 'no-store' below.
   */
  revalidate?: number;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal, cache, revalidate } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      // `cache` and `next.revalidate` are mutually exclusive in Next - passing
      // both makes the revalidate silently lose.
      ...(revalidate === undefined
        ? { cache: cache ?? 'no-store' }
        : { next: { revalidate } }),
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const payload: unknown = text ? safeJson(text) : null;

  if (!res.ok) {
    throw new ApiError(res.status, messageFrom(payload, res.status), payload);
  }
  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/**
 * Nest's exception filter returns `{ message: string | string[] }`. A
 * validation failure arrives as an array of every broken rule; showing the
 * first one is more useful than showing "Bad Request".
 */
function messageFrom(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object' && 'message' in payload) {
    const m = (payload as { message: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  }
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 404) return 'Not found.';
  if (status >= 500) return 'Something went wrong on our end. Please try again.';
  return 'Request failed.';
}

const qs = (params: Record<string, string | undefined>) => {
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 0) entries.push([key, value]);
  }
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

/* ------------------------------------------------------------------------
   Every endpoint below is verified against the backend controllers.

   Role per block, and it is the server that enforces each one:
     auth            - @Public (register, login, reset) or @AnyRole (logout)
     courses .. students - @Roles(Role.Student)
     staff           - @Roles(Role.Assistant, Role.Teacher), TA-scoped
     admin           - @Roles(Role.Teacher)

     publicCourses   - @Public, anonymous, read-only

   There is still no parent API (CLAUDE.md §7.1).
   ------------------------------------------------------------------------ */

/**
 * How long a public course page may be stale. Course content changes on the
 * scale of a term, not a request, and these are the pages that have to be fast
 * and crawlable (CLAUDE.md §4). Five minutes is short enough that publishing a
 * course feels immediate and long enough that a crawler does not become load.
 */
const PUBLIC_REVALIDATE_SECONDS = 300;

export const api = {
  /**
   * The Visitor surface. No token parameter anywhere in this block, by
   * construction - if one of these ever needs a token it is not public and
   * does not belong here.
   */
  publicCourses: {
    list: () =>
      request<PublicCourseSummary[]>('/public/courses', {
        revalidate: PUBLIC_REVALIDATE_SECONDS,
      }),

    /** Keyed by slug; an unpublished or unknown course answers 404 alike. */
    get: (slug: string) =>
      request<PublicCourseDetail>(
        `/public/courses/${encodeURIComponent(slug)}`,
        { revalidate: PUBLIC_REVALIDATE_SECONDS },
      ),
  },

  auth: {
    register: (body: { email: string; password: string; name: string }) =>
      request<AuthResult>('/auth/register', { method: 'POST', body }),

    login: (body: { email: string; password: string }) =>
      request<AuthResult>('/auth/login', { method: 'POST', body }),

    logout: (token: string) =>
      request<{ success: true }>('/auth/logout', { method: 'POST', token }),

    requestPasswordReset: (body: { email: string }) =>
      request<{ success: true }>('/auth/password-reset/request', {
        method: 'POST',
        body,
      }),

    confirmPasswordReset: (body: { token: string; newPassword: string }) =>
      request<{ success: true }>('/auth/password-reset/confirm', {
        method: 'POST',
        body,
      }),
  },

  courses: {
    list: (token: string) =>
      request<CourseListItem[]>('/courses', { token }),

    /** Every course on the platform, each flagged `enrolled` for this student. */
    catalog: (token: string) =>
      request<CatalogItem[]>('/courses/catalog', { token }),

    /**
     * Enrolls the signed-in student. Takes no student id - the backend reads
     * it from the token, so there is nothing here to point at someone else.
     * Enrolling twice succeeds and returns the existing enrollment.
     */
    enroll: (token: string, courseId: string) =>
      request<CourseListItem>(`/courses/${courseId}/enroll`, {
        method: 'POST',
        token,
      }),

    get: (token: string, courseId: string) =>
      request<CourseDetail>(`/courses/${courseId}`, { token }),
  },

  dashboard: {
    /**
     * The whole Home screen in one request - every enrolled course's stats,
     * material counts, next session and assessment list, plus the mailbox.
     *
     * Replaces the `2N + 2` fan-out the screen used to issue (`/courses`, then
     * a dashboard and an assessment list per course, then `/notifications`).
     * The server composes it from the same services the per-course screens
     * use, so the numbers are the same ones by construction.
     */
    home: (token: string) => request<StudentHomeResponse>('/dashboard', { token }),

    /** One course's dashboard. Still serves `/learn/[id]`; the Home screen
     *  reads `home()` instead. */
    get: (token: string, courseId: string) =>
      request<DashboardResponse>(`/courses/${courseId}/dashboard`, { token }),
  },

  assessments: {
    // The backend query DTO exposes `type` only - it has no status filter,
    // and adding one client-side would mean recomputing server-derived
    // status in the browser (CLAUDE.md §5.10). Filter by status in the UI
    // over the returned list instead.
    list: (token: string, courseId: string, filter?: { type?: string }) =>
      request<AssessmentListItem[]>(
        `/courses/${courseId}/assessments${qs({ type: filter?.type })}`,
        { token },
      ),

    get: (token: string, assessmentId: string) =>
      request<AssessmentDetail>(`/assessments/${assessmentId}`, { token }),

    submit: (
      token: string,
      assessmentId: string,
      body: { fileUrl?: string; answerText?: string },
    ) =>
      request<unknown>(`/assessments/${assessmentId}/submissions`, {
        method: 'POST',
        token,
        body,
      }),
  },

  materials: {
    list: (token: string, courseId: string, category?: MaterialCategory) =>
      request<MaterialsByCategory>(
        `/courses/${courseId}/materials${qs({ category })}`,
        { token },
      ),
  },

  recordings: {
    list: (
      token: string,
      courseId: string,
      filter?: { chapter?: string; topic?: string },
    ) =>
      request<RecordingListResponse>(
        `/courses/${courseId}/recordings${qs({
          chapter: filter?.chapter,
          topic: filter?.topic,
        })}`,
        { token },
      ),

    saveProgress: (token: string, recordingId: string, watchedSeconds: number) =>
      request<RecordingProgress>(`/recordings/${recordingId}/progress`, {
        method: 'POST',
        token,
        body: { watchedSeconds },
      }),
  },

  liveSessions: {
    list: (token: string, courseId: string) =>
      request<LiveSessionListResponse>(`/courses/${courseId}/live-sessions`, {
        token,
      }),

    next: (token: string, courseId: string) =>
      request<LiveSession | null>(`/courses/${courseId}/live-sessions/next`, {
        token,
      }),
  },

  reports: {
    summary: (token: string, courseId: string) =>
      request<ReportSummary>(`/courses/${courseId}/reports/summary`, { token }),

    documents: (token: string, courseId: string) =>
      request<ReportDocument[]>(`/courses/${courseId}/reports/documents`, {
        token,
      }),

    document: (token: string, documentId: string) =>
      request<ReportDocument>(`/reports/documents/${documentId}`, { token }),
  },

  notifications: {
    list: (token: string, unreadOnly?: boolean) =>
      request<NotificationListResponse>(
        `/notifications${qs({ unreadOnly: unreadOnly ? 'true' : undefined })}`,
        { token },
      ),

    markRead: (token: string, id: string) =>
      request<AppNotification>(`/notifications/${id}/read`, {
        method: 'POST',
        token,
      }),

    markAllRead: (token: string) =>
      request<{ updated: number }>('/notifications/read-all', {
        method: 'POST',
        token,
      }),
  },

  /* ----------------------------------------------------------------------
     /staff/* - reached by BOTH the teaching assistant and the teacher.
     The backend scopes a TA to their assigned courses and leaves the teacher
     unscoped; nothing here chooses, and nothing here may filter (CLAUDE.md
     §5.11 - there is no "fetch everything and hide some" path).
     ---------------------------------------------------------------------- */
  staff: {
    /** Courses the caller may work on. Scoped for a TA, all of them for admin. */
    courses: (token: string) =>
      request<StaffCourseSummary[]>('/staff/courses', { token }),

    /** Dashboard counts. `scope` says which reading of them is correct. */
    overview: (token: string) =>
      request<ManageOverview>('/staff/overview', { token }),

    roster: (token: string, courseId: string) =>
      request<CourseRosterResponse>(`/staff/courses/${courseId}/roster`, { token }),

    /** Modules and lessons, for the recording upload form's pickers. */
    outline: (token: string, courseId: string) =>
      request<OutlineModule[]>(`/staff/courses/${courseId}/outline`, { token }),

    submissions: (token: string, courseId: string, status?: GradingStatus) =>
      request<GradingQueueResponse>(
        `/staff/courses/${courseId}/submissions${qs({ status })}`,
        { token },
      ),

    /**
     * Takes no course id: the backend resolves the course from the
     * submission's own assessment before checking scope, so there is nothing
     * here that could name a course the caller does not hold.
     */
    grade: (
      token: string,
      submissionId: string,
      body: { score: number; feedback?: string; annotatedFileUrl?: string },
    ) =>
      request<GradingQueueItem>(`/staff/submissions/${submissionId}/grade`, {
        method: 'POST',
        token,
        body,
      }),

    recordings: (token: string, courseId: string) =>
      request<StaffRecording[]>(`/staff/courses/${courseId}/recordings`, { token }),

    /* --------------------------------------------------------------------
       Groups (CLAUDE.md §5.16). Note which of these name a *course* and
       which name a *group*: the course one is TA-scoped through
       `CourseStaffAssignment` and 404s a course the caller does not hold;
       the group ones are not, because a group spans courses and there is
       nothing to scope by - which is also what the client asked for
       (§5.11.1, "TAs are allowed to access all groups").
       -------------------------------------------------------------------- */

    courseGroups: (token: string, courseId: string) =>
      request<GroupSummary[]>(`/staff/courses/${courseId}/groups`, { token }),

    group: (token: string, groupId: string) =>
      request<GroupSummary>(`/staff/groups/${groupId}`, { token }),

    groupMembers: (token: string, groupId: string) =>
      request<GroupMemberView[]>(`/staff/groups/${groupId}/members`, { token }),

    /**
     * Placement - a TA power, granted by the client in as many words (§2.2,
     * §5.16). Deliberately *not* enrollment: a TA still cannot enroll or
     * unenroll, and placing a student grants them nothing they did not
     * already hold.
     */
    addGroupMember: (token: string, groupId: string, studentId: string) =>
      request<{ ok: true }>(`/staff/groups/${groupId}/members`, {
        method: 'POST',
        token,
        body: { studentId },
      }),

    removeGroupMember: (token: string, groupId: string, studentId: string) =>
      request<void>(`/staff/groups/${groupId}/members/${studentId}`, {
        method: 'DELETE',
        token,
      }),

    /* --------------------------------------------------------------------
       Authoring (§5.18). On /staff/* and not /admin/*: the client settled
       §11's open question on 2026-09-10 - a TA may create both assignments
       and quizzes.
       -------------------------------------------------------------------- */

    assessments: (token: string, courseId: string) =>
      request<AuthoredAssessment[]>(`/staff/courses/${courseId}/assessments`, {
        token,
      }),

    createAssessment: (
      token: string,
      courseId: string,
      body: {
        title: string;
        description?: string;
        instructions?: string;
        type: 'homework' | 'assignment' | 'quiz';
        topics?: string[];
        lessonId?: string;
        availableFrom: string;
        availableTo: string;
        dueAt: string;
        maxScore: number;
        allowedFileTypes: string[];
        maxFileSizeBytes: number;
        /** Required and non-empty: a task set for nobody is invisible. */
        targets: AssessmentTargetInput[];
      },
    ) =>
      request<AuthoredAssessment>(`/staff/courses/${courseId}/assessments`, {
        method: 'POST',
        token,
        body,
      }),

    updateAssessment: (
      token: string,
      assessmentId: string,
      body: {
        title?: string;
        description?: string;
        instructions?: string;
        topics?: string[];
        availableFrom?: string;
        availableTo?: string;
        dueAt?: string;
        maxScore?: number;
        allowedFileTypes?: string[];
        maxFileSizeBytes?: number;
      },
    ) =>
      request<AuthoredAssessment>(`/staff/assessments/${assessmentId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    /** Replaces the whole audience; it is a set, not a diff. */
    setAssessmentTargets: (
      token: string,
      assessmentId: string,
      targets: AssessmentTargetInput[],
    ) =>
      request<AuthoredAssessment>(`/staff/assessments/${assessmentId}/targets`, {
        method: 'POST',
        token,
        body: { targets },
      }),

    /** 400s once anything has been submitted - the API says why. */
    deleteAssessment: (token: string, assessmentId: string) =>
      request<void>(`/staff/assessments/${assessmentId}`, {
        method: 'DELETE',
        token,
      }),

    announcements: (token: string, courseId: string) =>
      request<Announcement[]>(`/staff/courses/${courseId}/announcements`, {
        token,
      }),

    postAnnouncement: (
      token: string,
      courseId: string,
      body: { title: string; body: string },
    ) =>
      request<Announcement>(`/staff/courses/${courseId}/announcements`, {
        method: 'POST',
        token,
        body,
      }),
  },

  /* ----------------------------------------------------------------------
     /admin/* - teacher only. A TA calling any of these gets 403 from
     `RolesGuard`, which is the enforcement; the UI hiding them is only
     courtesy (CLAUDE.md §8).
     ---------------------------------------------------------------------- */
  admin: {
    /* Group CRUD is teacher-only; *placement* is not (staff.addGroupMember
       above). The client's instruction covered placement explicitly and said
       nothing about who creates a group, so the narrow reading ships - the
       same call made for live-session scheduling (CLAUDE.md §11). */
    groups: (token: string) => request<GroupSummary[]>('/admin/groups', { token }),

    createGroup: (token: string, name: string) =>
      request<Group>('/admin/groups', { method: 'POST', token, body: { name } }),

    renameGroup: (token: string, groupId: string, name: string) =>
      request<Group>(`/admin/groups/${groupId}`, {
        method: 'PATCH',
        token,
        body: { name },
      }),

    /**
     * Enrolls a *group* in a course - the client's verb. It enrolls no
     * students: `Enrollment` stays the access gate (§5.16), which is what
     * keeps the payment question out of this surface.
     */
    addGroupCourse: (
      token: string,
      groupId: string,
      body: { courseId: string; learningMode: LearningMode },
    ) =>
      request<GroupCourse>(`/admin/groups/${groupId}/courses`, {
        method: 'POST',
        token,
        body,
      }),

    removeGroupCourse: (token: string, groupId: string, courseId: string) =>
      request<void>(`/admin/groups/${groupId}/courses/${courseId}`, {
        method: 'DELETE',
        token,
      }),

    students: (token: string, search?: string) =>
      request<StudentDirectoryEntry[]>(`/admin/students${qs({ search })}`, { token }),

    assistants: (token: string, search?: string) =>
      request<DirectoryEntry[]>(`/admin/assistants${qs({ search })}`, { token }),

    courseStaff: (token: string, courseId: string) =>
      request<CourseStaffMember[]>(`/admin/courses/${courseId}/staff`, { token }),

    assignStaff: (token: string, courseId: string, userId: string) =>
      request<CourseStaffMember>(`/admin/courses/${courseId}/staff`, {
        method: 'POST',
        token,
        body: { userId },
      }),

    unassignStaff: (token: string, courseId: string, userId: string) =>
      request<{ removed: true }>(`/admin/courses/${courseId}/staff/${userId}`, {
        method: 'DELETE',
        token,
      }),

    createRecording: (
      token: string,
      courseId: string,
      body: {
        moduleId: string;
        lessonId: string;
        title: string;
        chapter?: string;
        topics?: string[];
        videoUrl: string;
        durationSeconds: number;
        lessonDate?: string;
      },
    ) =>
      request<StaffRecording>(`/admin/courses/${courseId}/recordings`, {
        method: 'POST',
        token,
        body,
      }),

    updateRecording: (
      token: string,
      recordingId: string,
      body: {
        title?: string;
        chapter?: string;
        topics?: string[];
        videoUrl?: string;
        durationSeconds?: number;
        lessonDate?: string;
      },
    ) =>
      request<StaffRecording>(`/admin/recordings/${recordingId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    deleteRecording: (token: string, recordingId: string) =>
      request<{ removed: true }>(`/admin/recordings/${recordingId}`, {
        method: 'DELETE',
        token,
      }),

    auditLog: (token: string, filter?: { courseId?: string; cursor?: string }) =>
      request<AuditLogPage>(
        `/admin/audit-log${qs({ courseId: filter?.courseId, cursor: filter?.cursor })}`,
        { token },
      ),
  },

  students: {
    profile: (token: string) =>
      request<StudentProfile>('/students/me/profile', { token }),

    updateProfile: (
      token: string,
      body: { name?: string; phone?: string | null; avatarUrl?: string | null },
    ) =>
      request<StudentProfile>('/students/me/profile', {
        method: 'PATCH',
        token,
        body,
      }),

    changePassword: (
      token: string,
      body: { currentPassword: string; newPassword: string },
    ) =>
      request<{ success: true }>('/students/me/password', {
        method: 'POST',
        token,
        body,
      }),

    /**
     * The classmate list (CLAUDE.md §5.17) - one entry per group the caller
     * sits in on this course, never merged.
     *
     * An empty array is the normal answer for a student who is enrolled but
     * not yet placed (§7.2), and the UI has to say "you have not been added to
     * a group yet" rather than "no classmates".
     */
    classmates: (token: string, courseId: string) =>
      request<ClassmateGroup[]>(`/courses/${courseId}/classmates`, { token }),

    /**
     * Course announcements a student can read (§5.18). Until 2026-09-10 an
     * announcement reached them only as a notification with nowhere to click
     * through to; this is that page's read.
     */
    announcements: (token: string, courseId: string) =>
      request<Announcement[]>(`/courses/${courseId}/announcements`, { token }),
  },
};
