import { randomUUID } from 'node:crypto';

/**
 * Audit entry ids, and the one place in this codebase that does not just call
 * `randomUUID()`.
 *
 * The reason is that this id is not only an identifier - it is the second half
 * of the feed's sort key. Entries tie on `created_at` routinely (anything that
 * logs twice in one request, a batch reassignment), and ties break on the id,
 * so a random id means two events in the same millisecond display in a random
 * order. For a log whose whole job is telling Dr. Tahir what happened and in
 * what sequence (CLAUDE.md §5.4), that is worth fifteen lines to avoid.
 *
 * Format is `<ms since epoch>-<sequence>-<uuid>`, each fixed width so that
 * lexicographic order equals chronological order - "9999" sorts after "10000"
 * without the padding. All three parts earn their place:
 *
 *   * the millisecond orders across time;
 *   * the sequence orders *within* a millisecond, which a timestamp alone
 *     cannot - and same-millisecond writes are the normal case here, not an
 *     edge one, since a request that logs twice does both in well under 1ms;
 *   * the uuid keeps it unique across processes, where the sequence does not.
 *
 * **Caveat, stated rather than hidden:** the first two parts come from the
 * writing process, so across replicas the order is only as good as their clock
 * skew, and two replicas writing in the same millisecond fall back to the uuid.
 * That is strictly better than random and no worse than any other
 * app-generated ordering; a total order across replicas needs a database
 * sequence, which is a change to make when there is a second replica to need
 * it - the same "introduce it once" argument CLAUDE.md §5.11 makes about Redis.
 */

/** Per-process, and only ever affects ordering - never correctness. */
let lastMillis = 0;
let sequence = 0;

export function auditLogId(now: Date = new Date()): string {
  const millis = now.getTime();
  if (millis === lastMillis) {
    sequence += 1;
  } else {
    // Also resets when the clock steps backwards (NTP). The entry then sorts by
    // its own smaller timestamp, which is the honest answer: we do not know
    // better than the clock.
    lastMillis = millis;
    sequence = 0;
  }
  return [
    millis.toString(10).padStart(15, '0'),
    sequence.toString(10).padStart(6, '0'),
    randomUUID(),
  ].join('-');
}
