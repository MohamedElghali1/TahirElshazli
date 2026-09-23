import type {
  Announcement,
  AssessmentDetail,
  AssessmentListItem,
  AssessmentTargetInput,
  AuthoredAssessment,
  AuditLogPage,
  AuthResult,
  RegistrationResult,
  UserStatus,
  AdminCourse,
  AdminCourseWrite,
  AdminCoursePatch,
  CatalogItem,
  ClassmateGroup,
  CourseDetail,
  CourseListItem,
  CourseRosterResponse,
  DashboardResponse,
  GradingQueueItem,
  GradingQueueResponse,
  GradingStatus,
  GroupMemberView,
  GroupPatch,
  GroupReport,
  GroupSummary,
  GroupWrite,
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
  Assistant,
  AssistantWrite,
  AdminStudentUpdate,
  CreateStudentInput,
  StudentDetail,
  StudentDirectoryEntry,
  StudentHomeResponse,
  StudentProfile,
  AppNotification,
  BlogMediaInput,
  BlogCategory,
  BlogPostStatus,
  PublicBlogPost,
  StaffBlogPost,
  AttachmentInput,
  StaffTask,
  TaskDraft,
  TaskDraftUpdate,
  TaskDraftWrite,
  WorkType,
  UploadConfig,
  UploadResult,
} from './types';

/**
 * Where the *browser* reaches the API. Inlined into the client bundle at build
 * time, so it has to be an origin the user's machine can resolve - which is
 * why a container's service name can never go here.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * Where *this process* reaches the API when it renders on the server.
 *
 * These are two different networks and conflating them is a real outage rather
 * than a nicety. In Docker Compose the browser reaches the API on
 * `http://localhost:3001` through a published port, while a Server Component
 * rendering inside the web container resolves `localhost` to *itself* - so the
 * fetch connects to Next.js, not to Nest, and the page 500s or renders its
 * error state with nothing wrong at either end. `/courses/[slug]` did exactly
 * that until this existed.
 *
 * Read at call time rather than at module scope: this is deliberately NOT a
 * NEXT_PUBLIC_ variable, because a service name belongs to the private network
 * and has no business in a bundle shipped to a browser. It is supplied to the
 * *container* (docker-compose.yml), not to the build.
 *
 * Unset - `npm run dev`, or a deployment where both are the same origin - it
 * falls back to the browser value, which is the single-origin case and stays
 * correct.
 */
/**
 * Absolute src for a media item.
 *
 * An uploaded file's stored URL is a root-relative path (`/uploads/<name>`)
 * because the API mints it without knowing what origin will display it. In a
 * browser that path resolves against the *page's* origin - the Next.js server
 * on :3000 - while the file is served by Nest on :3001, so every uploaded
 * image renders broken while the file itself is perfectly fine. Externally
 * hosted media arrives as a full URL and is passed through untouched.
 *
 * This deliberately uses the browser origin even when called during server
 * rendering: the result goes into an `src` attribute that the *browser*
 * fetches, so the container-internal address would be unreachable and
 * `baseUrl()` is the wrong helper here.
 *
 * It stops being needed the day media lives on R2 and every stored URL is
 * absolute - at which point the `startsWith('/')` branch simply stops firing.
 */
export function mediaSrc(url: string): string {
  return url.startsWith('/') ? `${API_URL}${url}` : url;
}

function baseUrl(): string {
  if (typeof window !== 'undefined') {
    return API_URL;
  }
  return process.env.INTERNAL_API_URL?.trim() || API_URL;
}

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

/**
 * How long a *server-side* fetch waits before giving up.
 *
 * A caller-supplied `signal` always wins; this only fills the gap where there
 * is none. It exists because an unanswered socket is a worse failure than a
 * refused one: `next build` prerenders the public pages, so an API host that
 * accepts the connection and then says nothing hangs the build for 60s per
 * attempt and fails it after three - where a refused connection surfaces
 * instantly as the page's own error state and the build carries on. That is
 * not hypothetical; it is what a half-started container does.
 *
 * Server-side only. In a browser the request belongs to a user who can see it
 * spinning and navigate away, and capping it there would turn a slow
 * connection into a broken page.
 */
const SERVER_FETCH_TIMEOUT_MS = 10_000;

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal, cache, revalidate } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  // Only when the caller gave no signal of its own, and only on the server.
  const timeout =
    signal === undefined && typeof window === 'undefined'
      ? AbortSignal.timeout(SERVER_FETCH_TIMEOUT_MS)
      : undefined;

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ?? timeout,
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

/**
 * A multipart upload, which `request` above cannot express.
 *
 * Two things it must not do, and both are why this is separate rather than a
 * flag on `RequestOptions`:
 *
 *  - **No `Content-Type` header.** `fetch` generates the multipart boundary
 *    itself when handed a `FormData`, and setting the header by hand omits it,
 *    which makes the server reject a body that is otherwise perfectly formed.
 *  - **No JSON stringify.** The body is the `FormData`.
 *
 * The field name is `file`, matching `FileInterceptor('file')` on the server.
 * The server does not read the filename at all - it mints its own from the
 * validated MIME type - so nothing here needs to sanitise it.
 */
async function uploadFile(
  token: string,
  file: File,
  signal?: AbortSignal,
): Promise<UploadResult> {
  const form = new FormData();
  form.append('file', file);

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/staff/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'Could not reach the server. Check your connection.');
  }

  const text = await res.text();
  const payload: unknown = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, messageFrom(payload, res.status), payload);
  }
  return payload as UploadResult;
}

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

  /**
   * The blog (CLAUDE.md §5.19) - Dr. Tahir's achievements.
   *
   * `@Public` and read-only, and **both** the marketing site and the student
   * console read it from here. There is deliberately no student-scoped
   * equivalent: a published achievement is marketing material, so a second
   * route would only be a second place for the publication predicate to be got
   * wrong. The two surfaces differ in styling, not in what they may see.
   *
   * Never returns a draft, and never a scheduled post whose time has not come -
   * the server compares `publish_at` to its own clock on every read.
   */
  publicBlog: {
    /**
     * `live: false` asks for a cached read on the five-minute public window;
     * `live: true` skips it. The marketing pages are Server Components and take
     * the default; the in-app screens are Client Components, where Next's
     * `next.revalidate` is inert and silently doing nothing would be a
     * "why is this stale" question waiting to happen - so they say so.
     */
    list: (opts?: { limit?: number; live?: boolean }) =>
      request<PublicBlogPost[]>(
        `/public/blog${qs({ limit: opts?.limit?.toString() })}`,
        opts?.live ? {} : { revalidate: PUBLIC_REVALIDATE_SECONDS },
      ),

    /** Keyed by slug. A draft and a slug that never existed 404 alike. */
    get: (slug: string, opts?: { live?: boolean }) =>
      request<PublicBlogPost>(
        `/public/blog/${encodeURIComponent(slug)}`,
        opts?.live ? {} : { revalidate: PUBLIC_REVALIDATE_SECONDS },
      ),
  },

  auth: {
    /**
     * Creates an account **in the waiting queue**. Returns `{ status:
     * 'waiting' }` and no token (ruling R-6) - the account cannot sign in
     * until staff accept it, so there is no session to start here.
     */
    register: (body: { email: string; password: string; name: string }) =>
      request<RegistrationResult>('/auth/register', { method: 'POST', body }),

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

    /**
     * Accepts an assistant invitation (`AUTH-4`): creates the account and
     * signs them in, same shape as `login`. `token` is a path segment, not a
     * body field (`API_SPEC.yaml:789`).
     */
    acceptInvitation: (token: string, password: string) =>
      request<AuthResult>(`/auth/invitations/${token}/accept`, {
        method: 'POST',
        body: { password },
      }),
  },

  courses: {
    list: (token: string) =>
      request<CourseListItem[]>('/courses', { token }),

    /** Every course on the platform, each flagged `enrolled` for this student. */
    catalog: (token: string) =>
      request<CatalogItem[]>('/courses/catalog', { token }),

    /*
     * `enroll` is gone. `POST /courses/:id/enroll` is retired by `DOM-4`: a
     * student no longer puts themselves on a course, staff accepting their
     * registration does it (`admin.acceptRegistration` below). The route
     * answers 404.
     */

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

    /** Stats plus a per-student table (`GROUP-4`). No PDF route - the browser's own print-to-PDF renders the file. */
    groupReport: (token: string, groupId: string) =>
      request<GroupReport>(`/staff/groups/${groupId}/report`, { token }),

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

    /**
     * Every task the caller reaches, across courses (`TASK-6`). Group-grain:
     * each row's `targets` are narrowed to the caller's groups. Every filter
     * narrows; an unreachable course or group answers `[]`.
     */
    tasks: (
      token: string,
      filter: { courseId?: string; groupId?: string; search?: string } = {},
    ) => request<StaffTask[]>(`/staff/tasks${qs(filter)}`, { token }),

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
        workType?: WorkType;
        /** Required when `workType` is `link`. */
        externalUrl?: string;
        /** A Google Form editing link, required when `workType` is `google_form`. */
        googleForm?: string;
        /** Required and non-empty: a task set for nobody is invisible. */
        targets: AssessmentTargetInput[];
        /** Provenance only; bumps the draft's `usedCount`. The body is authoritative. */
        draftId?: string;
        attachments?: AttachmentInput[];
        /** Omitted is `true`: resubmission until the window ends. */
        allowResubmission?: boolean;
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
        workType?: WorkType;
        externalUrl?: string;
        googleForm?: string;
        /** Replaces the whole list; `[]` clears it. */
        attachments?: AttachmentInput[];
        allowResubmission?: boolean;
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

    /* --------------------------------------------------------------------
       The draft library (`TASK-2`). Scoped to the courses the caller reaches
       through a held group; a draft elsewhere 404s exactly like a missing one.
       -------------------------------------------------------------------- */

    taskDrafts: (
      token: string,
      filter: { courseId?: string; type?: TaskDraft['type'] } = {},
    ) => request<TaskDraft[]>(`/staff/task-drafts${qs(filter)}`, { token }),

    createTaskDraft: (token: string, body: TaskDraftWrite) =>
      request<TaskDraft>('/staff/task-drafts', { method: 'POST', token, body }),

    updateTaskDraft: (token: string, draftId: string, body: TaskDraftUpdate) =>
      request<TaskDraft>(`/staff/task-drafts/${draftId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    deleteTaskDraft: (token: string, draftId: string) =>
      request<void>(`/staff/task-drafts/${draftId}`, { method: 'DELETE', token }),

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

    /* --------------------------------------------------------------------
       The blog (CLAUDE.md §5.19). On /staff/* and reachable by an assistant:
       the client's instruction on 2026-09-10 named both actors, overriding
       §2.2's "a TA cannot touch the CMS" preset.

       None of these is course-scoped, and there is nothing to scope by - a
       post belongs to no course. Authorship stands in for it server-side: a
       TA may change only posts they wrote, and the API answers 403 if they
       try otherwise. The UI reflects that rather than enforcing it.
       -------------------------------------------------------------------- */

    /** Every post, drafts and future-dated ones included. The public feed cannot
     *  return these, which is why this is a separate route and not a filter. */
    blog: (token: string) => request<StaffBlogPost[]>('/staff/blog', { token }),

    /** By id, not slug: this is the editing surface and a draft has no address. */
    blogPost: (token: string, postId: string) =>
      request<StaffBlogPost>(`/staff/blog/${postId}`, { token }),

    createBlogPost: (
      token: string,
      body: {
        title: string;
        excerpt?: string;
        body: string;
        category?: BlogCategory;
        tags?: string[];
        /** Defaults to `draft` server-side - publishing is deliberate. */
        status?: BlogPostStatus;
        /** Only consulted for `scheduled`. */
        publishAt?: string;
        media?: BlogMediaInput[];
      },
    ) => request<StaffBlogPost>('/staff/blog', { method: 'POST', token, body }),

    /**
     * Edit, publish or schedule. There is no separate publish call: `status` is
     * an ordinary field and the audit entry's before/after pair carries the
     * transition.
     *
     * Takes no `media` key by design. A PATCH that omitted it would have to
     * mean either "leave it alone" or "delete it all", and whichever was chosen
     * the other reading would eventually delete somebody's gallery.
     */
    updateBlogPost: (
      token: string,
      postId: string,
      body: {
        title?: string;
        excerpt?: string;
        body?: string;
        category?: BlogCategory;
        tags?: string[];
        status?: BlogPostStatus;
        publishAt?: string;
      },
    ) =>
      request<StaffBlogPost>(`/staff/blog/${postId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    /** Replaces the whole gallery; it is a set, not a diff. */
    setBlogMedia: (token: string, postId: string, media: BlogMediaInput[]) =>
      request<StaffBlogPost>(`/staff/blog/${postId}/media`, {
        method: 'POST',
        token,
        body: { media },
      }),

    deleteBlogPost: (token: string, postId: string) =>
      request<void>(`/staff/blog/${postId}`, { method: 'DELETE', token }),

    /**
     * What this server will accept. Read before rendering the upload control,
     * because `STORAGE_DRIVER=none` is the production default and the form has
     * to offer a URL field rather than a file picker that 503s.
     */
    uploadConfig: (token: string) =>
      request<UploadConfig>('/staff/uploads/config', { token }),

    /**
     * Bytes in, a URL out. Multipart, so it does not go through `request` -
     * that helper JSON-stringifies its body and sets a Content-Type, and
     * `fetch` must be left to set the multipart boundary itself.
     *
     * Attaches nothing to anything: the returned URL becomes a `BlogMediaInput`
     * on the next `setBlogMedia` or `createBlogPost` call, which is the audited
     * write. Uploading and publishing are deliberately two steps.
     */
    upload: (token: string, file: File, signal?: AbortSignal) =>
      uploadFile(token, file, signal),
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

    /**
     * A group names its course at creation. Creating one enrols no students:
     * `Enrollment` stays the access gate (§5.16), which is what keeps the
     * payment question out of this surface.
     */
    createGroup: (token: string, body: GroupWrite) =>
      request<GroupSummary>('/admin/groups', { method: 'POST', token, body }),

    /**
     * Name, course, assistant, meets, room. Replaces the rename-only PATCH and
     * the two retired `/groups/:id/courses` routes at once - a group's course
     * is a field on it now, so changing it is editing the group.
     *
     * Moving a group that has members to another course answers **409**: every
     * member would be left enrolled on the old course while being targeted by
     * work set for the new one.
     */
    updateGroup: (token: string, groupId: string, body: GroupPatch) =>
      request<GroupSummary>(`/admin/groups/${groupId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    /** "Move N to group" (`GROUP-3`) - N `addMember` writes in one transaction. */
    bulkMoveMembers: (token: string, groupId: string, studentIds: string[]) =>
      request<{ moved: number }>(`/admin/groups/${groupId}/members/bulk`, {
        method: 'POST',
        token,
        body: { studentIds },
      }),

    /**
     * The student directory. `status` narrows it to one queue; **absent means
     * every status**, not `active` - this list is the only place a waiting
     * registration is visible, so a default that hid them would hide the queue
     * from the one person who can clear it.
     */
    students: (token: string, search?: string, status?: UserStatus) =>
      request<StudentDirectoryEntry[]>(
        `/admin/students${qs({ search, status })}`,
        { token },
      ),

    /**
     * Accepts a waiting registration: activates the account, enrols it on the
     * group's course and places it in the cohort - one transaction on the
     * server, so it is all three or none.
     *
     * The group decides the course; there is no separate course parameter,
     * because a group studies exactly one.
     */
    acceptRegistration: (token: string, studentId: string, groupId: string) =>
      request<StudentDirectoryEntry>(`/admin/students/${studentId}/accept`, {
        method: 'POST',
        token,
        body: { groupId },
      }),

    /**
     * Rejects one. The account is kept, not deleted. Teacher and admin only -
     * `registration.reject` is one of the four verbs withheld from an
     * assistant, refused server-side with 403 whatever the nav renders.
     */
    rejectRegistration: (token: string, studentId: string, reason?: string) =>
      request<{ ok: true }>(`/admin/students/${studentId}/reject`, {
        method: 'POST',
        token,
        body: reason === undefined ? {} : { reason },
      }),

    /** The staff detail view - every profile field (`PEOPLE-2`). */
    studentDetail: (token: string, studentId: string) =>
      request<StudentDetail>(`/admin/students/${studentId}`, { token }),

    /** Edits any field, including the three staff-owned ones (`PEOPLE-2`). */
    updateStudent: (token: string, studentId: string, body: AdminStudentUpdate) =>
      request<StudentDetail>(`/admin/students/${studentId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    /** Creates a student directly, already active, and emails a sign-in link (`PEOPLE-3`). */
    createStudent: (token: string, body: CreateStudentInput) =>
      request<StudentDetail>('/admin/students', { method: 'POST', token, body }),

    /** Creates a course. It is a **draft** unless `isPublished` says otherwise. */
    createCourse: (token: string, body: AdminCourseWrite) =>
      request<AdminCourse>('/admin/courses', { method: 'POST', token, body }),

    /** Edits one. 409 on a slug another course already holds. */
    updateCourse: (token: string, courseId: string, body: AdminCoursePatch) =>
      request<AdminCourse>(`/admin/courses/${courseId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    // `courseStaff`/`assignStaff`/`unassignStaff` are gone with
    // `/admin/courses/:courseId/staff` (`AUTH-2`): an assistant's reach is held
    // at the group grain now, and the route that edits it is unit 5's
    // `PATCH /admin/assistants/{userId}`.

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

    auditLog: (
      token: string,
      filter?: { actorId?: string; courseId?: string; cursor?: string },
    ) =>
      request<AuditLogPage>(
        `/admin/audit-log${qs({
          actorId: filter?.actorId,
          courseId: filter?.courseId,
          cursor: filter?.cursor,
        })}`,
        { token },
      ),

    /** The assistants/admins list - real accounts and pending invitations, merged (`PEOPLE-4`). */
    assistants: (token: string) => request<Assistant[]>('/admin/assistants', { token }),

    inviteAssistant: (token: string, body: AssistantWrite) =>
      request<Assistant>('/admin/assistants', { method: 'POST', token, body }),

    updateAssistant: (token: string, userId: string, body: AssistantWrite) =>
      request<Assistant>(`/admin/assistants/${userId}`, {
        method: 'PATCH',
        token,
        body,
      }),

    removeAssistant: (token: string, userId: string) =>
      request<void>(`/admin/assistants/${userId}`, { method: 'DELETE', token }),

    resendAssistantInvitation: (token: string, userId: string) =>
      request<{ ok: true }>(`/admin/assistants/${userId}/resend`, {
        method: 'POST',
        token,
      }),
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
