/**
 * Which nav item a pathname belongs to. Exact match wins outright; otherwise
 * the longest `href` the pathname is nested under wins, so `/manage/tasks`
 * does not light up while `/manage/tasks/drafts` (a deeper, more specific
 * item in the same section) is the one actually open.
 */
export function activeHrefFor(pathname: string, hrefs: readonly string[]): string | null {
  if (hrefs.includes(pathname)) return pathname;
  let best: string | null = null;
  for (const href of hrefs) {
    if (pathname.startsWith(`${href}/`) && (!best || href.length > best.length)) {
      best = href;
    }
  }
  return best;
}
