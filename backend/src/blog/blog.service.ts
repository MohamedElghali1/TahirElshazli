import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { Role } from '../auth/roles.enum.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type {
  BlogMedia,
  BlogPostPatch,
  BlogPostWithMedia,
  BlogRepository,
  NewBlogMedia,
} from './interfaces/blog-repository.interface.js';
import { BLOG_REPOSITORY } from './interfaces/blog-repository.interface.js';
import { uniqueSlug } from './slug.js';
import type {
  BlogMediaInputDto,
  CreateBlogPostDto,
  UpdateBlogPostDto,
} from './dto/blog.dto.js';

/** Bounded, so neither the public feed nor the staff list drains the table. */
export const MAX_BLOG_PAGE_SIZE = 50;
export const DEFAULT_BLOG_PAGE_SIZE = 12;

/** How much of `body` stands in for a missing excerpt. */
const EXCERPT_FALLBACK_CHARS = 200;

/**
 * An emptied optional text field means "no value", and has to be stored as
 * NULL rather than as `''`.
 *
 * `@IsOptional()` only skips `null` and `undefined`, so an author who clears
 * the standfirst sends `''`, which validates fine and would then be stored.
 * `summary` is `excerpt ?? summarise(body)` — and `''` is not nullish, so the
 * fallback would not fire and every card for that post would render a blank
 * summary. Nullifying here rather than in the DTO keeps it true for both the
 * create and the patch path.
 */
function blankToNull(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * What a screen actually renders: the post, its gallery, who wrote it, and
 * whether it is live right now.
 *
 * `authorName` rather than `authorId`, because "posted by Dr. Tahir" is the
 * point of an achievements feed and no client should have to resolve a user id
 * to render a byline. `authorId` is dropped on the public shape below for the
 * same reason it is present on the staff one: staff need to know whose post it
 * is in order to know what they may edit; a visitor does not need an internal
 * identifier at all.
 */
export interface BlogPostView extends BlogPostWithMedia {
  authorName: string;
  /**
   * Whether it is visible to a reader **now** - derived, never stored
   * (CLAUDE.md §5.10, §5.13).
   *
   * This is what lets scheduling work with no background job: a `scheduled`
   * post whose `publishAt` has passed is live, and the row is never rewritten
   * to say so. The staff list is the only place it can be false, since every
   * post on a public read is live by construction.
   */
  isLive: boolean;
  /** `excerpt`, or the opening of `body` when there is none. */
  summary: string;
}

/** The public projection. No `authorId`, no `status`, no draft anything. */
export type PublicBlogPostView = Omit<
  BlogPostView,
  'authorId' | 'isLive' | 'status'
>;

@Injectable()
export class BlogService {
  constructor(
    @Inject(BLOG_REPOSITORY) private readonly blogRepo: BlogRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /* ----------------------------------------------------------------------
     Reads
     ---------------------------------------------------------------------- */

  /**
   * The public feed, and the same one the student console reads.
   *
   * There is deliberately **no separate student endpoint**. The content is
   * identical - a published achievement is marketing material and there is
   * nothing about it a student may see that a visitor may not - so a second
   * route would be a second place for the publication predicate to be got
   * wrong. The student console renders this in the product's own styling; the
   * marketing site renders it in the site's. One API, two surfaces.
   */
  async listPublic(limit: number, offset: number): Promise<PublicBlogPostView[]> {
    const posts = await this.blogRepo.findLive(limit, offset);
    const views = await this.decorate(posts);
    return views.map((view) => this.toPublic(view));
  }

  async getPublicBySlug(slug: string): Promise<PublicBlogPostView> {
    const post = await this.blogRepo.findLiveBySlug(slug);
    if (!post) {
      // A draft, a future-dated post and a slug that never existed all answer
      // identically - the same rule migration 004 set for an unpublished
      // course. The 404 must not confirm that a draft is sitting there.
      throw new NotFoundException('Post not found');
    }
    const [view] = await this.decorate([post]);
    return this.toPublic(view as BlogPostView);
  }

  /** Everything, drafts included. Staff only; the controller enforces that. */
  async listForStaff(limit: number, offset: number): Promise<BlogPostView[]> {
    return this.decorate(await this.blogRepo.findAll(limit, offset));
  }

  async getForStaff(postId: string): Promise<BlogPostView> {
    const post = await this.blogRepo.findById(postId);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    const [view] = await this.decorate([post]);
    return view as BlogPostView;
  }

  /* ----------------------------------------------------------------------
     Writes. Every one of them audited, and every one inside a transaction -
     `AuditService.record` throws outside one (CLAUDE.md §5.4).
     ---------------------------------------------------------------------- */

  /**
   * Create a post, with its gallery, as one unit.
   *
   * The media goes in inside the same transaction as the post and the audit
   * entry. A post that committed without the images it was written around is a
   * broken artifact somebody has to notice and repair by hand, and §5.4's
   * whole point is that the record and the action commit together.
   */
  async create(
    actor: StaffActor,
    input: CreateBlogPostDto,
  ): Promise<BlogPostView> {
    // Outside the transaction on purpose: it is a read loop, and holding a
    // transaction open across it buys nothing. The UNIQUE constraint on `slug`
    // is what actually decides a race, which `uniqueSlug` documents.
    const slug = await uniqueSlug(input.title, (candidate) =>
      this.blogRepo.slugExists(candidate),
    );

    const status = input.status ?? 'draft';

    return this.db.runInTransaction(async () => {
      const post = await this.blogRepo.create({
        slug,
        title: input.title,
        excerpt: blankToNull(input.excerpt),
        body: input.body,
        category: input.category ?? 'achievement',
        tags: input.tags ?? [],
        status,
        // Only a scheduled post has an opinion about this. Anything else is
        // dated now, which keeps the feed's sort key meaningful for a draft
        // too - it appears where the author would expect it in the list.
        publishAt: this.resolvePublishAt(status, input.publishAt),
        authorId: actor.id,
      });

      const media = await this.insertMedia(post.id, input.media ?? []);

      await this.audit.record({
        actorId: actor.id,
        // Derived from the acting user, never assumed (§5.4). A TA's post and
        // Dr. Tahir's must not read alike in the log - which matters more here
        // than usual, because the byline on the public page comes from the
        // same id.
        actorRole: actor.role === Role.Assistant ? Role.Assistant : Role.Teacher,
        action: 'blog_post.created',
        targetType: 'blog_post',
        targetId: post.id,
        courseId: null,
        before: null,
        after: {
          slug: post.slug,
          title: post.title,
          status: post.status,
          category: post.category,
          publishAt: post.publishAt,
          mediaCount: media.length,
        },
      });

      const [view] = await this.decorate([{ ...post, media }]);
      return view as BlogPostView;
    });
  }

  /**
   * Edit a post. Author-scoped for a TA (see `assertMayMutate`).
   *
   * `status` is part of an ordinary patch rather than a separate publish
   * action. The audit entry's before/after pair carries the transition, so
   * "who published this and when" is answerable without a fourth action on the
   * union - and a draft→published edit that also fixed a typo would otherwise
   * have to be logged twice.
   */
  async update(
    postId: string,
    actor: StaffActor,
    input: UpdateBlogPostDto,
  ): Promise<BlogPostView> {
    const before = await this.blogRepo.findById(postId);
    if (!before) {
      throw new NotFoundException('Post not found');
    }
    this.assertMayMutate(before, actor);

    const patch: BlogPostPatch = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.excerpt !== undefined) patch.excerpt = blankToNull(input.excerpt);
    if (input.body !== undefined) patch.body = input.body;
    if (input.category !== undefined) patch.category = input.category;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.status !== undefined) patch.status = input.status;
    if (input.publishAt !== undefined) patch.publishAt = input.publishAt;

    // A post moved to `scheduled` with no date would be scheduled for whenever
    // it happened to be created, which is almost certainly the past - so it
    // would go live immediately, which is the opposite of what was asked for.
    if (input.status === 'scheduled' && input.publishAt === undefined) {
      patch.publishAt = before.publishAt;
    }

    return this.db.runInTransaction(async () => {
      const after = await this.blogRepo.update(postId, patch);
      if (!after) {
        // Deleted between the read and the write. Rare, and a 404 is the
        // truthful answer rather than a 500.
        throw new NotFoundException('Post not found');
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role === Role.Assistant ? Role.Assistant : Role.Teacher,
        action: 'blog_post.updated',
        targetType: 'blog_post',
        targetId: postId,
        courseId: null,
        // A flat, scalar pair, and one the repository's copy-on-read
        // guarantees actually differs - §7.1 records this aliasing bug being
        // found twice, where `before` and `after` came out identical and the
        // entry recorded a change that appeared never to have happened.
        before: {
          title: before.title,
          status: before.status,
          category: before.category,
          publishAt: before.publishAt,
        },
        after: {
          title: after.title,
          status: after.status,
          category: after.category,
          publishAt: after.publishAt,
        },
      });

      const [view] = await this.decorate([after]);
      return view as BlogPostView;
    });
  }

  /**
   * Replace the gallery.
   *
   * A set and not a diff, the same shape as `POST /staff/assessments/:id
   * /targets` - and for the same reason: an author dragging items around and
   * removing one is describing a final state, not a sequence of operations.
   *
   * The bytes behind a removed item are **not** deleted from storage. That is
   * deliberate: another post may reference the same URL, an author who removes
   * an image by accident should be able to paste it back, and an orphaned file
   * costs disk while a wrongly-deleted one costs the thing itself. Reaping
   * genuinely unreferenced files belongs with R2 and a lifecycle rule, not
   * with a request handler.
   */
  async setMedia(
    postId: string,
    actor: StaffActor,
    items: BlogMediaInputDto[],
  ): Promise<BlogPostView> {
    const post = await this.blogRepo.findById(postId);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    this.assertMayMutate(post, actor);

    return this.db.runInTransaction(async () => {
      for (const existing of post.media) {
        await this.blogRepo.removeMedia(existing.id);
      }
      const media = await this.insertMedia(postId, items);

      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role === Role.Assistant ? Role.Assistant : Role.Teacher,
        action: 'blog_post.media_set',
        targetType: 'blog_post',
        targetId: postId,
        courseId: null,
        before: { mediaCount: post.media.length },
        after: { mediaCount: media.length },
      });

      const [view] = await this.decorate([{ ...post, media }]);
      return view as BlogPostView;
    });
  }

  /**
   * Delete a post and, by cascade, its gallery rows.
   *
   * Unlike an assessment - which refuses deletion once anything has been
   * submitted, because a submission is a student's work (§5.18) - a blog post
   * has no dependent student data at all. Nobody has built anything on top of
   * it, so a hard delete loses only what the author chose to lose, and the
   * audit entry keeps the fact that it existed.
   */
  async remove(postId: string, actor: StaffActor): Promise<void> {
    const post = await this.blogRepo.findById(postId);
    if (!post) {
      throw new NotFoundException('Post not found');
    }
    this.assertMayMutate(post, actor);

    await this.db.runInTransaction(async () => {
      await this.blogRepo.remove(postId);
      await this.audit.record({
        actorId: actor.id,
        actorRole: actor.role === Role.Assistant ? Role.Assistant : Role.Teacher,
        action: 'blog_post.deleted',
        targetType: 'blog_post',
        targetId: postId,
        courseId: null,
        // The whole of what was lost, because after this there is no row to
        // read it from. An audit entry naming an id nobody can resolve is a
        // record that something happened, not a record of what.
        before: {
          slug: post.slug,
          title: post.title,
          status: post.status,
          mediaCount: post.media.length,
        },
        after: null,
      });
    });
  }

  /* ----------------------------------------------------------------------
     Internals
     ---------------------------------------------------------------------- */

  /**
   * Who may change a post.
   *
   * The teacher may change anything. **A TA may change only their own posts**,
   * and that is a judgment call worth naming: the client's instruction
   * (2026-09-10) was that *"the teacher, or ta can upload data"* - it granted
   * authoring and said nothing about editing each other's work. Since the feed
   * is Dr. Tahir's own achievements under his byline, the narrow reading ships
   * - the same call made for live-session scheduling (§11).
   *
   * It is one method and one condition, so widening it is a one-line change
   * with a test beside it rather than an audit of every route.
   *
   * A 403 here, not the 404 `StaffScopeService` uses for an unassigned course.
   * The reasoning that makes 404 right there does not apply: this post is
   * listed on the caller's own console, so they already know it exists, and
   * pretending otherwise would just make the UI lie about a row it is showing.
   */
  private assertMayMutate(post: BlogPostWithMedia, actor: StaffActor): void {
    if (actor.role === Role.Teacher) {
      return;
    }
    if (post.authorId !== actor.id) {
      throw new ForbiddenException(
        'Assistants can only edit posts they wrote themselves.',
      );
    }
  }

  /**
   * `publishAt` for a new post.
   *
   * Only `scheduled` gets to name a time. A `published` post carrying a future
   * date would be invisible while claiming to be published - the two fields
   * would disagree and the row would be the confusing kind of correct - and a
   * draft's date is never read.
   */
  private resolvePublishAt(status: string, requested?: string): string {
    if (status === 'scheduled' && requested) {
      return requested;
    }
    return new Date().toISOString();
  }

  /** Positions come from the array's order, never from the client (see the DTO). */
  private async insertMedia(
    postId: string,
    items: BlogMediaInputDto[],
  ): Promise<BlogMedia[]> {
    const created: BlogMedia[] = [];
    for (const [index, item] of items.entries()) {
      const input: NewBlogMedia = {
        postId,
        kind: item.kind,
        url: item.url,
        caption: item.caption ?? null,
        mimeType: item.mimeType ?? null,
        sizeBytes: item.sizeBytes ?? null,
        position: index,
      };
      created.push(await this.blogRepo.addMedia(input));
    }
    return created;
  }

  /**
   * Add the byline, the live flag and the summary.
   *
   * One batched user read for the whole page rather than one per post - the
   * N+1 §7.3 still calls worth avoiding, because it grows with the rows on a
   * page someone opens daily. An author whose account has since been removed
   * cannot happen (`blog_posts.author_id` is RESTRICT), but the fallback is
   * there rather than a non-null assertion: a missing byline is a smaller
   * failure than a crashed feed.
   */
  private async decorate(
    posts: BlogPostWithMedia[],
  ): Promise<BlogPostView[]> {
    if (posts.length === 0) {
      return [];
    }
    const authors = await this.userRepo.findByIds([
      ...new Set(posts.map((p) => p.authorId)),
    ]);
    const nameById = new Map(authors.map((a) => [a.id, a.name]));
    const now = Date.now();

    return posts.map((post) => ({
      ...post,
      authorName: nameById.get(post.authorId) ?? 'English Team',
      isLive:
        post.status === 'published' ||
        (post.status === 'scheduled' && Date.parse(post.publishAt) <= now),
      summary: post.excerpt ?? this.summarise(post.body),
    }));
  }

  /**
   * The opening of the body, cut at a word boundary.
   *
   * Computed on read rather than copied into `excerpt` at write time, so
   * editing the body cannot leave a standfirst describing the previous
   * version - the same reason the per-group assessment window is a nullable
   * override rather than a copy (§6.1).
   */
  private summarise(body: string): string {
    const flat = body.replace(/\s+/g, ' ').trim();
    if (flat.length <= EXCERPT_FALLBACK_CHARS) {
      return flat;
    }
    const cut = flat.slice(0, EXCERPT_FALLBACK_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
  }

  /**
   * Strip what a visitor has no business receiving.
   *
   * `authorId` is an internal identifier and the byline already carries the
   * readable half. `isLive` is trivially true for everything on a public read,
   * and returning it only invites a client to think it might not be. `status`
   * goes for a subtler reason: a live post can legitimately still say
   * `scheduled` (nothing rewrites the row - see the repository), which is
   * accurate history and meaningless to a reader, who would reasonably take it
   * to mean "not out yet". `category` stays, because an achievement and an
   * article really are different things on the page.
   */
  private toPublic(view: BlogPostView): PublicBlogPostView {
    const {
      authorId: _authorId,
      isLive: _isLive,
      status: _status,
      ...rest
    } = view;
    return rest;
  }
}
