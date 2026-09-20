import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  BlogService,
  DEFAULT_BLOG_PAGE_SIZE,
  type BlogPostView,
} from './blog.service.js';
import {
  CreateBlogPostDto,
  ListBlogQueryDto,
  SetBlogMediaDto,
  UpdateBlogPostDto,
} from './dto/blog.dto.js';

/**
 * Authoring the blog. `/staff/*`, and reachable by an assistant.
 *
 * That last part is a **change to §2.2's preset**, made on the client's own
 * instruction on 2026-09-10: *"a blog page where the teacher, or ta can upload
 * data (images, videos..etc) with description."* The preset had said a TA
 * "cannot touch the CMS"; the client named both actors, and per CLAUDE.md §0
 * the user wins. §5.19 records the change so the preset stops being wrong.
 *
 * **Nothing here goes through `StaffScopeService`, and there is nothing to
 * scope by.** A blog post belongs to no course, so there is no
 * `CourseStaffAssignment` row that could answer "may this TA touch it" - the
 * same situation as the group routes, which name a group rather than a course
 * (§5.11.1). What stands in for it is authorship: `BlogService.assertMayMutate`
 * lets a TA change only their own posts, in one method, so widening that later
 * is one line rather than a re-audit.
 *
 * The list here is the one read that returns **drafts**, which is the whole
 * reason it is not the public route with a filter on it.
 *
 * No `@UseGuards`: `JwtAuthGuard` and `RolesGuard` are global in
 * `app.module.ts`, and `RolesGuard` refuses any route with no `@Roles`.
 */
@Controller('staff/blog')
@Roles(...STAFF_ALL)
export class StaffBlogController {
  constructor(private readonly blog: BlogService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /** Every post, drafts and future-dated ones included, newest first. */
  @Get()
  async list(@Query() query: ListBlogQueryDto): Promise<BlogPostView[]> {
    return this.blog.listForStaff(
      query.limit ?? DEFAULT_BLOG_PAGE_SIZE,
      query.offset ?? 0,
    );
  }

  /** By id, not slug: this is the editing surface and a draft has no audience. */
  @Get(':postId')
  async get(@Param('postId') postId: string): Promise<BlogPostView> {
    return this.blog.getForStaff(postId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateBlogPostDto,
    @Request() req: { user: JwtPayload },
  ): Promise<BlogPostView> {
    return this.blog.create(this.actor(req), body);
  }

  /**
   * Edit, publish or schedule. There is no separate publish route: `status` is
   * an ordinary field and the audit entry's before/after pair carries the
   * transition, so one action covers "fixed a typo" and "made it live" without
   * an edit that does both being logged twice.
   */
  @Patch(':postId')
  async update(
    @Param('postId') postId: string,
    @Body() body: UpdateBlogPostDto,
    @Request() req: { user: JwtPayload },
  ): Promise<BlogPostView> {
    return this.blog.update(postId, this.actor(req), body);
  }

  /** Replaces the whole gallery; it is a set, not a diff. */
  @Post(':postId/media')
  async setMedia(
    @Param('postId') postId: string,
    @Body() body: SetBlogMediaDto,
    @Request() req: { user: JwtPayload },
  ): Promise<BlogPostView> {
    return this.blog.setMedia(postId, this.actor(req), body.media);
  }

  @Delete(':postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('postId') postId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    return this.blog.remove(postId, this.actor(req));
  }
}
