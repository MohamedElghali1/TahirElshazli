import { Controller, Get, Param } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import { PUBLIC_BROWSE_LIMIT } from '../common/rate-limit/limits.js';
import {
  PublicCoursesService,
  type PublicCourseDetail,
  type PublicCourseSummary,
} from './public-courses.service.js';

/**
 * The Visitor surface. Until now the only anonymous routes were the health
 * check and the auth pair, and CLAUDE.md §7.1 recorded Visitor as "None" - the
 * marketing site rendered from a hardcoded file because there was no public API
 * to read. This is that API.
 *
 * `@Public()` sits on the class, so every route here is anonymous by
 * construction rather than by each method remembering. That is safe *because
 * the whole controller is read-only and reads one gated method* - it exposes
 * `findPublished` and `findBySlug` and nothing else. A mutating route must
 * never be added to this class; it belongs behind the global guards like
 * everything else.
 */
@Controller('public/courses')
@Public()
@RateLimit(PUBLIC_BROWSE_LIMIT)
export class PublicCoursesController {
  constructor(private readonly publicCourses: PublicCoursesService) {}

  /** The catalog behind the landing page and the public course index. */
  @Get()
  async listCourses(): Promise<PublicCourseSummary[]> {
    return this.publicCourses.listCourses();
  }

  /**
   * Keyed by slug, not id: this is a shareable marketing URL, and ids are
   * internal. An unpublished or unknown slug 404s either way, so the response
   * cannot be used to tell a draft course from one that never existed.
   */
  @Get(':slug')
  async getCourse(@Param('slug') slug: string): Promise<PublicCourseDetail> {
    return this.publicCourses.getCourseBySlug(slug);
  }
}
