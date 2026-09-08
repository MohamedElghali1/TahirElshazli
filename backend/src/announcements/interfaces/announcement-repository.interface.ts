import type { AnnouncementAudienceType } from '../announcement-audience.js';

export interface Announcement {
  id: string;
  /**
   * The §6.1 wire form - `all_students`, `all_tas` or `course:<id>` - built by
   * `encodeAudience` from the two stored columns. Carried alongside the pair
   * rather than instead of it so a client can render one string while a query
   * still filters on an indexed column.
   */
  audience: string;
  audienceType: AnnouncementAudienceType;
  courseId: string | null;
  title: string;
  body: string;
  postedBy: string;
  postedAt: string;
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

/** `id` and `postedAt` are the repository's to assign. */
export type NewAnnouncement = Omit<Announcement, 'id' | 'postedAt' | 'audience'>;

export interface AnnouncementRepository {
  create(input: NewAnnouncement): Promise<Announcement>;
  /**
   * One course's announcements, newest first.
   *
   * Offset paging, matching `CourseRepository.findAll` and the admin directory
   * rather than the audit feed's keyset cursor. The audit log needs a cursor
   * because it is written constantly and an offset silently repeats rows once
   * anything lands between two reads; a course gets a handful of announcements
   * a term, so the row-shifting that makes offsets wrong there does not arise
   * at this rate. `posted_at` is still stored at millisecond precision so that
   * a keyset cursor can be added later without the bug migration 002 records.
   */
  findByCourse(
    courseId: string,
    limit: number,
    offset: number,
  ): Promise<Announcement[]>;
  /** Every announcement, whatever the audience. Admin-only; the controller enforces it. */
  findAll(limit: number, offset: number): Promise<Announcement[]>;
}

export const ANNOUNCEMENT_REPOSITORY = Symbol('ANNOUNCEMENT_REPOSITORY');
