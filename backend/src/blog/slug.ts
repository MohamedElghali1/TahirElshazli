/**
 * Turning a title into a URL.
 *
 * Kept out of the service because the *uniqueness* half needs a repository and
 * the *shape* half does not, and only the shape half is worth unit-testing on
 * its own.
 */

/** Long enough for a real headline, short enough not to be a URL nobody reads. */
const MAX_SLUG_LENGTH = 80;

/**
 * ASCII-only, and that is a real limitation rather than an oversight.
 *
 * CLAUDE.md §4 says Arabic content may appear, and an Arabic title slugifies to
 * the empty string here. That is why `slugify` can return `''` and why
 * `uniqueSlug` below has a fallback instead of trusting it - a post titled
 * entirely in Arabic gets a dated slug rather than a broken one. Percent-encoded
 * Arabic in a URL is the alternative and it is worse: unreadable when copied and
 * inconsistent between clients.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    // Strip combining marks, so "Café" becomes "cafe" rather than "caf".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // A trailing hyphen left behind by the slice.
    .replace(/-+$/g, '');
}

/**
 * A slug nothing else is using.
 *
 * Appends `-2`, `-3`, … rather than a random suffix, because the point of a
 * slug is that a human can read it. The loop is bounded: without a ceiling a
 * pathological input would sit here issuing queries, and past a couple of dozen
 * collisions on the same title the honest answer is a date, not a counter.
 *
 * This is a check-then-insert, so two simultaneous creates of the same title
 * can both see the slug free and race. The UNIQUE constraint in migration 008
 * is what actually decides it - one insert fails and the author retries. A
 * transaction would not help: the losing writer still has to pick a new slug.
 */
export async function uniqueSlug(
  title: string,
  exists: (slug: string) => Promise<boolean>,
  now: Date = new Date(),
): Promise<string> {
  const base = slugify(title) || `post-${now.toISOString().slice(0, 10)}`;

  if (!(await exists(base))) {
    return base;
  }
  for (let n = 2; n <= 25; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }
  // 25 posts sharing a title is not a naming problem any more. A timestamp is
  // ugly and unique, which is the right trade at this point.
  return `${base}-${now.getTime()}`;
}
