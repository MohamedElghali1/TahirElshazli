import { Injectable } from '@nestjs/common';
import type {
  LiveSession,
  LiveSessionRepository,
  LiveSessionUpdate,
  NewLiveSession,
} from '../interfaces/live-session-repository.interface.js';

/**
 * Mirrors `InMemoryGroupRepository`'s seed exactly: group-1 studies course-1,
 * group-2 studies course-2 - the same 1:1 mapping the old `courseId` values
 * encoded, so every fixture that used to key off a course still resolves to
 * the same rows keyed off that course's one group.
 */
const STUB_SESSIONS: LiveSession[] = [
  {
    id: 'sess-1',
    groupId: 'group-1',
    title: 'Revision: Moles & Titrations',
    meetingLink: 'https://zoom.us/j/98765432101',
    scheduledAt: '2026-08-20T18:00:00Z',
    endsAt: '2026-08-20T19:30:00Z',
    assistantId: null,
    description: null,
    privateNotes: null,
    isVisible: true,
    state: 'published',
  },
  {
    id: 'sess-2',
    groupId: 'group-1',
    title: 'Organic Chemistry Q&A',
    meetingLink: 'https://zoom.us/j/98765432102',
    scheduledAt: '2026-08-27T18:00:00Z',
    endsAt: '2026-08-27T19:30:00Z',
    assistantId: null,
    description: null,
    privateNotes: null,
    isVisible: true,
    state: 'published',
  },
  {
    id: 'sess-3',
    groupId: 'group-1',
    title: 'Past Paper Walkthrough - Paper 1',
    meetingLink: 'https://zoom.us/j/98765432103',
    scheduledAt: '2026-09-03T18:00:00Z',
    endsAt: '2026-09-03T20:00:00Z',
    assistantId: null,
    description: null,
    privateNotes: null,
    isVisible: true,
    state: 'published',
  },
  {
    id: 'sess-4',
    groupId: 'group-2',
    title: 'IELTS Speaking Practice',
    meetingLink: 'https://zoom.us/j/12345678901',
    scheduledAt: '2026-08-29T16:00:00Z',
    endsAt: '2026-08-29T17:00:00Z',
    assistantId: null,
    description: null,
    privateNotes: null,
    isVisible: true,
    state: 'published',
  },
  {
    id: 'sess-5',
    groupId: 'group-2',
    title: 'IELTS Writing Task 2 Clinic',
    meetingLink: 'https://zoom.us/j/12345678902',
    scheduledAt: '2026-08-15T16:00:00Z',
    endsAt: '2026-08-15T17:00:00Z',
    assistantId: null,
    description: null,
    privateNotes: null,
    isVisible: true,
    state: 'published',
  },
  {
    id: 'sess-6',
    groupId: 'group-2',
    title: 'IELTS Listening Strategies',
    meetingLink: 'https://zoom.us/j/12345678903',
    scheduledAt: '2026-08-08T16:00:00Z',
    endsAt: '2026-08-08T17:00:00Z',
    assistantId: null,
    description: null,
    privateNotes: null,
    isVisible: true,
    state: 'published',
  },
];

@Injectable()
export class InMemoryLiveSessionRepository implements LiveSessionRepository {
  /**
   * A per-instance copy of the seed, and a copy of each row rather than a
   * shallow clone of the array - a shared array would leak a session
   * scheduled in one test into the next, and a shallow copy would leave
   * `update` mutating the module-level seed object through a shared
   * reference (CLAUDE.md §9's aliasing defect, shipped twice already).
   */
  private readonly sessions: LiveSession[] = STUB_SESSIONS.map((s) => ({ ...s }));

  /** Sequence for generated ids, so two writes in one millisecond differ. */
  private nextId = 1;

  private byDate(sessions: LiveSession[]): LiveSession[] {
    return sessions.sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    );
  }

  async findByGroups(groupIds: readonly string[]): Promise<LiveSession[]> {
    const wanted = new Set(groupIds);
    return this.byDate(
      this.sessions.filter((s) => wanted.has(s.groupId)).map((s) => ({ ...s })),
    );
  }

  async findById(sessionId: string): Promise<LiveSession | null> {
    const session = this.sessions.find((s) => s.id === sessionId);
    // A copy, so a caller holding a "before" snapshot cannot watch it change
    // underneath them when `update` writes.
    return session ? { ...session } : null;
  }

  async create(input: NewLiveSession): Promise<LiveSession> {
    const session: LiveSession = {
      id: `sess-${Date.now()}-${this.nextId++}`,
      groupId: input.groupId,
      title: input.title,
      meetingLink: input.meetingLink,
      scheduledAt: input.scheduledAt,
      endsAt: input.endsAt,
      assistantId: input.assistantId,
      description: input.description,
      privateNotes: input.privateNotes,
      isVisible: input.isVisible,
      state: input.state,
    };
    this.sessions.push(session);
    return { ...session };
  }

  async update(
    sessionId: string,
    patch: LiveSessionUpdate,
  ): Promise<LiveSession | null> {
    const existing = this.sessions.find((s) => s.id === sessionId);
    if (!existing) {
      return null;
    }
    // Field by field rather than a spread of `patch`, so an explicit
    // `undefined` on the wire cannot blank a column.
    if (patch.title !== undefined) existing.title = patch.title;
    if (patch.meetingLink !== undefined) existing.meetingLink = patch.meetingLink;
    if (patch.scheduledAt !== undefined) existing.scheduledAt = patch.scheduledAt;
    if (patch.endsAt !== undefined) existing.endsAt = patch.endsAt;
    if (patch.assistantId !== undefined) existing.assistantId = patch.assistantId;
    if (patch.description !== undefined) existing.description = patch.description;
    if (patch.privateNotes !== undefined) existing.privateNotes = patch.privateNotes;
    if (patch.isVisible !== undefined) existing.isVisible = patch.isVisible;
    if (patch.state !== undefined) existing.state = patch.state;
    return { ...existing };
  }

  async remove(sessionId: string): Promise<boolean> {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) {
      return false;
    }
    this.sessions.splice(index, 1);
    // Unlike before this repository split, attendance is not deleted here:
    // it is a separate aggregate behind its own repository now, and a
    // repository must not reach across to another one (CLAUDE.md §5). The
    // caller owns the cascade - see `AttendanceRepository.removeForSession`
    // and its callers.
    return true;
  }
}
