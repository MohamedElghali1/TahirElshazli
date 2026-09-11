import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import { PUBLIC_BROWSE_LIMIT } from '../common/rate-limit/limits.js';
import {
  BlogService,
  DEFAULT_BLOG_PAGE_SIZE,
  type PublicBlogPostView,
} from './blog.service.js';
import { ListBlogQueryDto } from './dto/blog.dto.js';

/**
 * The blog, read side (CLAUDE.md §5.19).
 *
 * **One controller serves both audiences the client named.** They asked for
 * students to be able to see it and the decision was taken to fill the
 * already-existing, already-empty `/blog` page on the marketing site with the
 * same content - a published achievement is marketing material, and the two
 * readers differ in styling rather than in what they may see. A second
 * student-only route would be a second place for the publication predicate to
 * be got wrong, which is the failure that actually matters here.
 *
 * A signed-in student's token is simply ignored on these routes rather than
 * required. Nothing behind them is per-reader, so there is nothing a token
 * could scope.
 *
 * `@Public()` on the class, matching `PublicCoursesController`, and safe for
 * the same reason: the whole controller is read-only and reaches only the two
 * gated service methods. **A mutating route must never be added here** - the
 * staff surface is the other controller in this module and it sits behind the
 * global guards.
 */
@Controller('public/blog')
@Public()
@RateLimit(PUBLIC_BROWSE_LIMIT)
export class PublicBlogController {
  constructor(private readonly blog: BlogService) {}

  /**
   * Published posts, and scheduled ones whose time has come. Never a draft -
   * the clock predicate lives in the repository so neither read can forget it.
   */
  @Get()
  async list(
    @Query() query: ListBlogQueryDto,
  ): Promise<PublicBlogPostView[]> {
    return this.blog.listPublic(
      query.limit ?? DEFAULT_BLOG_PAGE_SIZE,
      query.offset ?? 0,
    );
  }

  /**
   * Keyed by slug, not id: a shareable address, and ids are internal. A draft,
   * a future-dated post and a slug that never existed all 404 alike, so the
   * response cannot be used to discover that something unpublished is there.
   */
  @Get(':slug')
  async get(@Param('slug') slug: string): Promise<PublicBlogPostView> {
    return this.blog.getPublicBySlug(slug);
  }
}
