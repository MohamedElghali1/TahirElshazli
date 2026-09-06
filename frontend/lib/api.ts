import type {
  AssessmentDetail,
  AssessmentListItem,
  AuthResult,
  CourseDetail,
  CourseListItem,
  DashboardResponse,
  LiveSession,
  LiveSessionListResponse,
  MaterialCategory,
  MaterialsByCategory,
  NotificationListResponse,
  RecordingListResponse,
  RecordingProgress,
  ReportDocument,
  ReportSummary,
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
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, token, signal, cache } = opts;

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
      cache: cache ?? 'no-store',
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
   Each one is @Roles(Role.Student) except the auth block - CLAUDE.md §7.1
   records that no visitor, parent, TA or admin API exists yet.
   ------------------------------------------------------------------------ */

export const api = {
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

    get: (token: string, courseId: string) =>
      request<CourseDetail>(`/courses/${courseId}`, { token }),
  },

  dashboard: {
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
  },
};
