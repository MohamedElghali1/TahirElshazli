import { api } from './api';
import type { PublicCourseSummary } from './types';

/**
 * Catalog reads for the public site, wrapped so a marketing page never dies
 * with the API.
 *
 * The rule is different here than inside the LMS. A student staring at a
 * failed dashboard needs to be told it failed; a visitor on the homepage needs
 * the homepage. CLAUDE.md §3 asks the code to "degrade sensibly when a service
 * is not configured", and these pages are also prerendered at build time - when
 * the API is not running during `next build`, an unhandled throw takes the
 * whole build down rather than one section of one page.
 *
 * So: the copy, the FAQ and the calls to action always render. Only the course
 * grid goes missing, and it says so.
 */
export async function fetchCatalog(): Promise<PublicCourseSummary[] | null> {
  try {
    return await api.publicCourses.list();
  } catch {
    return null;
  }
}
