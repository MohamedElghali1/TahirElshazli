/**
 * The audience of an announcement, and the one place that converts between the
 * wire form and the stored form.
 *
 * CLAUDE.md §6.1 names the audience as `all_students`, `course:<id>` or
 * `all_tas`, and that single string is what the API speaks - it is what a UI
 * renders and what an admin filter passes. Storage splits it in two
 * (`audience_type` plus a nullable `course_id`) because the alternative,
 * keeping `course:course-1` as a text blob, makes "announcements for this
 * course" a LIKE query against an unindexable prefix and makes a foreign key
 * to `courses` impossible.
 *
 * The pair is kept honest by a CHECK in migration 005: `course_id` is non-null
 * exactly when the type is `course`. This file is the only thing that builds
 * the pair, and `parse` rejects anything malformed rather than coercing it -
 * a half-understood audience would be a message delivered to the wrong people.
 *
 * Note what is *not* here: a list of recipient user ids. §5.14 requires the
 * audience to resolve at send time, so the descriptor is stored and the roll
 * is read fresh on every send.
 */

export type AnnouncementAudienceType = 'all_students' | 'course' | 'all_tas';

export interface AnnouncementAudience {
  type: AnnouncementAudienceType;
  /** The course, and only for `type: 'course'`. */
  courseId: string | null;
}

const COURSE_PREFIX = 'course:';

/** The id alphabet this schema uses, matching `AssignStaffDto.userId`. */
const COURSE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * The `@Matches` pattern for the admin DTO. Written from the same parts the
 * parser uses, so the validator and the parser cannot drift into accepting
 * different strings.
 */
export const AUDIENCE_PATTERN = new RegExp(
  `^(all_students|all_tas|${COURSE_PREFIX}[A-Za-z0-9_-]{1,64})$`,
);

/** The §6.1 wire form. Total: every valid pair has exactly one spelling. */
export function encodeAudience(audience: AnnouncementAudience): string {
  return audience.type === 'course'
    ? `${COURSE_PREFIX}${audience.courseId}`
    : audience.type;
}

/** Null for anything that is not a well-formed audience. */
export function parseAudience(raw: string): AnnouncementAudience | null {
  if (raw === 'all_students' || raw === 'all_tas') {
    return { type: raw, courseId: null };
  }
  if (!raw.startsWith(COURSE_PREFIX)) {
    return null;
  }
  const courseId = raw.slice(COURSE_PREFIX.length);
  return COURSE_ID.test(courseId) ? { type: 'course', courseId } : null;
}
