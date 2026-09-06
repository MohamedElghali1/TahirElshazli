/**
 * Keyset cursor for the audit feed.
 *
 * `created_at` alone is not a key. Two entries written in the same millisecond
 * - a batch reassignment, or anything that logs twice in one request - share a
 * timestamp, and a `created_at < $cursor` page boundary then either skips the
 * tied rows or repeats them forever. The id breaks the tie, so the sort key is
 * the pair `(created_at, id)` and the cursor has to carry both.
 *
 * The encoding is opaque to callers by convention only; it is not a secret and
 * nothing security-relevant depends on its contents. A malformed one is
 * rejected rather than coerced, so a client cannot widen its own page by
 * handing back something the server half-understands.
 */
export interface AuditCursor {
  createdAt: string;
  id: string;
}

const SEPARATOR = '|';

export function encodeAuditCursor(cursor: AuditCursor): string {
  return `${cursor.createdAt}${SEPARATOR}${cursor.id}`;
}

/** Returns null for anything that is not a well-formed cursor. */
export function decodeAuditCursor(raw: string): AuditCursor | null {
  const separator = raw.indexOf(SEPARATOR);
  if (separator <= 0 || separator === raw.length - 1) {
    return null;
  }
  const createdAt = raw.slice(0, separator);
  const id = raw.slice(separator + 1);
  if (Number.isNaN(Date.parse(createdAt))) {
    return null;
  }
  return { createdAt, id };
}

/**
 * True when `entry` sorts strictly after `cursor` in the feed's
 * `(createdAt DESC, id DESC)` order - i.e. belongs on a later page.
 *
 * Mirrors the row-wise `(created_at, id) < ($1, $2)` the Postgres repository
 * hands to the database, so the two drivers page identically.
 */
export function sortsAfter(entry: AuditCursor, cursor: AuditCursor): boolean {
  if (entry.createdAt !== cursor.createdAt) {
    return entry.createdAt < cursor.createdAt;
  }
  return entry.id < cursor.id;
}
