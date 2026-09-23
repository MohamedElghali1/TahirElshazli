import type { AnnouncementAudienceType } from '../announcement-audience.js';

export interface Announcement {
  id: string;
  /**
   * The §6.1 wire form - `all_students`, `all_tas`, `course:<id>` or `group:<id>` - built by
   * `encodeAudience` from the stored columns. Carried alongside the pair
   * rather than instead of it so a client can render one string while a query
   * still filters on an indexed column.
   */
  audience: string;
  audienceType: AnnouncementAudienceType;
  courseId: string | null;
  groupId: string | null;
  title: string;
  body: string;
  mediaKind: 'image' | 'video' | 'youtube' | 'file' | null;
  mediaUrl: string | null;
  postedBy: string;
  createdAt: string;
  publishedAt: string | null;
  /**
   * How many people it reached, counted at send time.
   *
   * A number, deliberately, and not the list. CLAUDE.md §5.14 forbids storing
   * a frozen set of recipient ids; a count records what happened without
   * pretending to be a membership list anyone could act on later. It is also
   * the only honest answer to "who got this?" once the roll has changed.
   */
  recipientCount: number;
}

/** `id`, `createdAt`, and `publishedAt` are the repository's to assign. */
export type NewAnnouncement = Omit<Announcement, 'id' | 'createdAt' | 'publishedAt' | 'audience'>;

export interface AnnouncementRepository {
  create(input: NewAnnouncement): Promise<Announcement>;
  findById(id: string): Promise<Announcement | null>;
  /**
   * Guarded publish: only writes `published_at` and `recipient_count` if `published_at` is null.
   * Returns null if already published.
   */
  publish(id: string, recipientCount: number): Promise<Announcement | null>;
  /**
   * Ordinary update: patches fields without guarding on `published_at`.
   * Never writes `published_at` or `recipient_count`.
   */
  update(id: string, patch: Partial<Omit<Announcement, 'id' | 'createdAt' | 'publishedAt' | 'recipientCount' | 'audience'>>): Promise<Announcement | null>;
  /**
   * Guarded remove: deletes only if `published_at` is null.
   */
  remove(id: string): Promise<boolean>;

  findByGroup(
    groupId: string,
    limit: number,
    offset: number,
    status?: 'draft' | 'published',
  ): Promise<Announcement[]>;

  /**
   * One course's announcements, newest first.
   *
   * Offset paging, matching `CourseRepository.findAll` and the admin directory
   * rather than the audit feed's keyset cursor. The audit log needs a cursor
   * because it is written constantly and an offset silently repeats rows once
   * anything lands between two reads; a course gets a handful of announcements
   * a term, so the row-shifting that makes offsets wrong there does not arise
   * at this rate. `published_at` is still stored at millisecond precision so that
   * a keyset cursor can be added later without the bug migration 002 records.
   */
  findByCourse(
    courseId: string,
    limit: number,
    offset: number,
    status?: 'draft' | 'published',
  ): Promise<Announcement[]>;
  /** Every announcement, whatever the audience. Admin-only; the controller enforces it. */
  findAll(limit: number, offset: number, status?: 'draft' | 'published'): Promise<Announcement[]>;
}

export const ANNOUNCEMENT_REPOSITORY = Symbol('ANNOUNCEMENT_REPOSITORY');
