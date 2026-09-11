import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, numOrNull } from '../../database/database.types.js';
import type {
  BlogCategory,
  BlogMedia,
  BlogMediaKind,
  BlogPost,
  BlogPostPatch,
  BlogPostStatus,
  BlogPostWithMedia,
  BlogRepository,
  NewBlogMedia,
  NewBlogPost,
} from '../interfaces/blog-repository.interface.js';

interface BlogPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  category: BlogCategory;
  tags: string[];
  status: BlogPostStatus;
  publish_at: Date;
  author_id: string;
  created_at: Date;
  updated_at: Date;
}

interface BlogMediaRow {
  id: string;
  post_id: string;
  kind: BlogMediaKind;
  url: string;
  caption: string | null;
  mime_type: string | null;
  size_bytes: string | number | null;
  position: number;
  created_at: Date;
}

const SELECT_POST = `
  SELECT id, slug, title, excerpt, body, category, tags, status,
         publish_at, author_id, created_at, updated_at
    FROM blog_posts`;

const SELECT_MEDIA = `
  SELECT id, post_id, kind, url, caption, mime_type, size_bytes, position, created_at
    FROM blog_post_media`;

/**
 * CLAUDE.md §5.13's clock decision, in SQL, in exactly one place.
 *
 * Written as a fragment shared by the list and the by-slug read rather than
 * repeated in both, because a by-slug read that forgot the clock would serve an
 * unpublished post to anyone holding the link - and that is the sort of thing
 * that gets fixed in one query and left in the other.
 *
 * `now()` is the *database's* clock, not the API process's. On one host that is
 * a distinction without a difference; across a VPS and a managed database it is
 * the difference between one authority on when a post goes live and two that
 * drift.
 */
const LIVE_PREDICATE = `(status = 'published'
   OR (status = 'scheduled' AND publish_at <= now()))`;

function toPost(row: BlogPostRow): BlogPost {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    category: row.category,
    // `pg` hands a TEXT[] back as a real array. Copied so a caller cannot
    // mutate what a later read of the same object would return.
    tags: [...row.tags],
    status: row.status,
    publishAt: iso(row.publish_at),
    authorId: row.author_id,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

function toMedia(row: BlogMediaRow): BlogMedia {
  return {
    id: row.id,
    postId: row.post_id,
    kind: row.kind,
    url: row.url,
    caption: row.caption,
    mimeType: row.mime_type,
    // BIGINT arrives as a string from `pg`; every size in this schema is
    // comfortably inside the safe integer range.
    sizeBytes: numOrNull(row.size_bytes),
    position: row.position,
    createdAt: iso(row.created_at),
  };
}

@Injectable()
export class PostgresBlogRepository implements BlogRepository {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Attach each post's gallery in **one** extra query rather than one per post.
   *
   * The obvious loop here is `for (const post of posts) findMedia(post.id)`,
   * which is the N+1 CLAUDE.md §7.3 says is still worth avoiding at 300
   * students - the cost grows with the number of rows on a page someone opens
   * daily. Two queries answer any page size.
   */
  private async withMedia(posts: BlogPost[]): Promise<BlogPostWithMedia[]> {
    if (posts.length === 0) {
      return [];
    }
    const rows = await this.db.query<BlogMediaRow>(
      `${SELECT_MEDIA} WHERE post_id = ANY($1) ORDER BY post_id, position, id`,
      [posts.map((p) => p.id)],
    );

    const byPost = new Map<string, BlogMedia[]>();
    for (const row of rows) {
      const item = toMedia(row);
      const bucket = byPost.get(item.postId);
      if (bucket) {
        bucket.push(item);
      } else {
        byPost.set(item.postId, [item]);
      }
    }
    // The posts keep the order the outer query returned them in; only the
    // media is grouped. A post with no media gets an empty array and not a
    // missing key, so the response shape never varies on the client.
    return posts.map((post) => ({ ...post, media: byPost.get(post.id) ?? [] }));
  }

  async findLive(limit: number, offset: number): Promise<BlogPostWithMedia[]> {
    // `blog_posts_live_idx` is partial on `status <> 'draft'` and ordered on
    // exactly this pair, so it serves both the filter and the ORDER BY.
    const rows = await this.db.query<BlogPostRow>(
      `${SELECT_POST} WHERE ${LIVE_PREDICATE}
       ORDER BY publish_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return this.withMedia(rows.map(toPost));
  }

  async findLiveBySlug(slug: string): Promise<BlogPostWithMedia | null> {
    const row = await this.db.queryOne<BlogPostRow>(
      `${SELECT_POST} WHERE slug = $1 AND ${LIVE_PREDICATE}`,
      [slug],
    );
    if (!row) {
      // A draft and a slug that never existed answer identically, the same way
      // an unpublished course does (migration 004). The response must not tell
      // anyone that a draft is sitting there.
      return null;
    }
    const [post] = await this.withMedia([toPost(row)]);
    return post ?? null;
  }

  async findAll(limit: number, offset: number): Promise<BlogPostWithMedia[]> {
    const rows = await this.db.query<BlogPostRow>(
      `${SELECT_POST} ORDER BY publish_at DESC, id DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return this.withMedia(rows.map(toPost));
  }

  async findById(postId: string): Promise<BlogPostWithMedia | null> {
    const row = await this.db.queryOne<BlogPostRow>(
      `${SELECT_POST} WHERE id = $1`,
      [postId],
    );
    if (!row) return null;
    const [post] = await this.withMedia([toPost(row)]);
    return post ?? null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM blog_posts WHERE slug = $1',
      [slug],
    );
    return row !== null;
  }

  async create(input: NewBlogPost): Promise<BlogPostWithMedia> {
    const row = await this.db.queryOne<BlogPostRow>(
      `INSERT INTO blog_posts
         (id, slug, title, excerpt, body, category, tags, status, publish_at, author_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, slug, title, excerpt, body, category, tags, status,
                 publish_at, author_id, created_at, updated_at`,
      [
        randomUUID(),
        input.slug,
        input.title,
        input.excerpt,
        input.body,
        input.category,
        input.tags,
        input.status,
        input.publishAt,
        input.authorId,
      ],
    );
    // An INSERT ... RETURNING cannot come back empty; the same assertion every
    // other repository's `create` makes.
    return { ...toPost(row as BlogPostRow), media: [] };
  }

  /**
   * A partial update built from whichever fields were supplied.
   *
   * The SET list is assembled from a fixed map of column names, never from the
   * caller's keys - CLAUDE.md §8 allows no string-built SQL that a request can
   * influence. Values are still parameters; only the column list is
   * interpolated, and it can only ever be one of these seven literals.
   */
  async update(
    postId: string,
    patch: BlogPostPatch,
  ): Promise<BlogPostWithMedia | null> {
    const columns: Record<keyof BlogPostPatch, string> = {
      title: 'title',
      excerpt: 'excerpt',
      body: 'body',
      category: 'category',
      tags: 'tags',
      status: 'status',
      publishAt: 'publish_at',
    };

    const sets: string[] = [];
    const values: unknown[] = [postId];
    for (const [key, column] of Object.entries(columns) as [
      keyof BlogPostPatch,
      string,
    ][]) {
      const value = patch[key];
      if (value !== undefined) {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      }
    }

    if (sets.length === 0) {
      // Nothing to change. Returning the current row rather than issuing an
      // `UPDATE ... SET` with an empty list, which is a syntax error.
      return this.findById(postId);
    }
    // Always bumped, and not left to the caller to remember.
    sets.push('updated_at = now()');

    const row = await this.db.queryOne<BlogPostRow>(
      `UPDATE blog_posts SET ${sets.join(', ')} WHERE id = $1
       RETURNING id, slug, title, excerpt, body, category, tags, status,
                 publish_at, author_id, created_at, updated_at`,
      values,
    );
    if (!row) return null;
    const [post] = await this.withMedia([toPost(row)]);
    return post ?? null;
  }

  async remove(postId: string): Promise<boolean> {
    // `blog_post_media.post_id` is ON DELETE CASCADE, so the gallery goes with
    // it in the same statement.
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM blog_posts WHERE id = $1 RETURNING id',
      [postId],
    );
    return row !== null;
  }

  async addMedia(input: NewBlogMedia): Promise<BlogMedia> {
    const row = await this.db.queryOne<BlogMediaRow>(
      `INSERT INTO blog_post_media
         (id, post_id, kind, url, caption, mime_type, size_bytes, position)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, post_id, kind, url, caption, mime_type, size_bytes,
                 position, created_at`,
      [
        randomUUID(),
        input.postId,
        input.kind,
        input.url,
        input.caption,
        input.mimeType,
        input.sizeBytes,
        input.position,
      ],
    );
    return toMedia(row as BlogMediaRow);
  }

  async findMedia(mediaId: string): Promise<BlogMedia | null> {
    const row = await this.db.queryOne<BlogMediaRow>(
      `${SELECT_MEDIA} WHERE id = $1`,
      [mediaId],
    );
    return row ? toMedia(row) : null;
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    const row = await this.db.queryOne<{ id: string }>(
      'DELETE FROM blog_post_media WHERE id = $1 RETURNING id',
      [mediaId],
    );
    return row !== null;
  }
}
