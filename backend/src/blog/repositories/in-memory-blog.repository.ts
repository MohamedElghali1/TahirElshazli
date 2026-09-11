import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  BlogMedia,
  BlogPost,
  BlogPostPatch,
  BlogPostWithMedia,
  BlogRepository,
  NewBlogMedia,
  NewBlogPost,
} from '../interfaces/blog-repository.interface.js';

/**
 * Seeded, on the same reasoning as `InMemoryGroupRepository`.
 *
 * The line worth being careful about is the one that separates furniture from
 * words in Dr. Tahir's mouth. A seeded *announcement* would be the latter,
 * which is why `InMemoryAnnouncementRepository` starts empty. These three rows
 * are the former: without them the blog index, the post detail page and the
 * gallery all render their empty states, and a developer cannot tell a working
 * feed from a broken one.
 *
 * The set is chosen to cover the three states, because it is the *statuses*
 * that are easy to get wrong: `blog-1` is published, `blog-2` is scheduled and
 * already live (so the clock predicate has something to admit), and `blog-3` is
 * scheduled for the future - the row that must never appear on a public read.
 */
const SEED_POSTS: readonly BlogPost[] = [
  {
    id: 'blog-1',
    slug: 'igcse-chemistry-results-june-2026',
    title: 'June 2026: 34 A* grades across the Chemistry cohorts',
    excerpt:
      'The June series results are in, and they are the strongest set this ' +
      'programme has produced.',
    body:
      'Ninety-one students sat IGCSE Chemistry this June across the Saturday ' +
      'and Tuesday groups. Thirty-four came away with an A*, and every student ' +
      'who completed the full past-paper programme placed in the top two ' +
      'grades.\n\nWhat changed this year was the marking turnaround. Every ' +
      'paper came back annotated inside a week, which meant nobody spent a ' +
      'month repeating a mistake they had already made.',
    category: 'achievement',
    tags: ['IGCSE', 'Chemistry', 'Results'],
    status: 'published',
    publishAt: '2026-08-22T09:00:00.000Z',
    authorId: 'teacher-1',
    createdAt: '2026-08-20T14:00:00.000Z',
    updatedAt: '2026-08-22T09:00:00.000Z',
  },
  {
    id: 'blog-2',
    slug: 'ielts-speaking-band-8-walkthrough',
    title: 'What a Band 8 speaking answer actually sounds like',
    excerpt: null,
    body:
      'Two students agreed to have their Part 2 answers recorded and pulled ' +
      'apart. Both scored Band 8; neither used a word you would not already ' +
      'know.\n\nThe difference is in what they do when they run out of things ' +
      'to say, and that is the part nobody teaches.',
    category: 'article',
    tags: ['IELTS', 'Speaking'],
    // Scheduled and past its time, so `findLive` has to admit it. This is the
    // row that would be invisible if publication depended on a job having run.
    status: 'scheduled',
    publishAt: '2026-09-01T06:00:00.000Z',
    authorId: 'assistant-1',
    createdAt: '2026-08-28T11:00:00.000Z',
    updatedAt: '2026-08-28T11:00:00.000Z',
  },
  {
    id: 'blog-3',
    slug: 'october-intake-open-evening',
    title: 'Open evening for the October intake',
    excerpt: 'Dated far enough ahead that no public read should return it.',
    body:
      'Details of the October intake open evening, with the timetable for both ' +
      'the IGCSE and IELTS tracks.',
    category: 'resource',
    tags: ['Admissions'],
    // Deliberately far in the future. A public read returning this is the bug
    // the scheduling predicate exists to prevent, so the fixture makes it
    // detectable rather than theoretical.
    status: 'scheduled',
    publishAt: '2099-10-01T17:00:00.000Z',
    authorId: 'teacher-1',
    createdAt: '2026-09-05T08:00:00.000Z',
    updatedAt: '2026-09-05T08:00:00.000Z',
  },
];

const SEED_MEDIA: readonly BlogMedia[] = [
  {
    id: 'blog-media-1',
    postId: 'blog-1',
    kind: 'image',
    url: 'https://cdn.example.com/blog/results-board-june-2026.jpg',
    caption: 'The grade distribution for both Chemistry groups, June 2026.',
    mimeType: 'image/jpeg',
    sizeBytes: 412_338,
    position: 0,
    createdAt: '2026-08-20T14:05:00.000Z',
  },
  {
    id: 'blog-media-2',
    postId: 'blog-1',
    kind: 'video',
    url: 'https://cdn.example.com/blog/results-assembly-2026.mp4',
    caption: 'Results morning at the Maadi centre.',
    mimeType: 'video/mp4',
    sizeBytes: 18_774_102,
    position: 1,
    createdAt: '2026-08-20T14:09:00.000Z',
  },
  {
    id: 'blog-media-3',
    postId: 'blog-2',
    kind: 'file',
    url: 'https://cdn.example.com/blog/band-8-transcripts.pdf',
    caption: 'Both answers, transcribed with the examiner criteria alongside.',
    mimeType: 'application/pdf',
    sizeBytes: 96_140,
    position: 0,
    createdAt: '2026-08-28T11:12:00.000Z',
  },
];

@Injectable()
export class InMemoryBlogRepository implements BlogRepository {
  /**
   * Per-instance copies. A spec that publishes a draft must not leak that into
   * the next spec, which a shared module-level array would - the same
   * reasoning as every other in-memory repository here.
   */
  private readonly posts: BlogPost[] = SEED_POSTS.map((p) => ({
    ...p,
    // The array too, or a `tags` edit in one spec mutates the frozen seed and
    // every later spec inherits it.
    tags: [...p.tags],
  }));
  private readonly media: BlogMedia[] = SEED_MEDIA.map((m) => ({ ...m }));

  /**
   * Every read hands back copies, posts and media alike.
   *
   * Not a nicety: CLAUDE.md §7.1 records this exact aliasing defect being
   * found twice, in grading and then in recordings. An audited service takes a
   * `before` snapshot and then calls `update`; if the snapshot is the stored
   * object, `before` and `after` come out identical and the audit entry
   * records a change that appears never to have happened - evidence-shaped and
   * empty, which is worse than no entry at all.
   */
  private clone(post: BlogPost): BlogPostWithMedia {
    return {
      ...post,
      tags: [...post.tags],
      media: this.media
        .filter((m) => m.postId === post.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
        .map((m) => ({ ...m })),
    };
  }

  /** Newest first, with the id breaking a shared millisecond. */
  private sorted(posts: BlogPost[]): BlogPost[] {
    return posts
      .slice()
      .sort(
        (a, b) =>
          b.publishAt.localeCompare(a.publishAt) || b.id.localeCompare(a.id),
      );
  }

  /**
   * CLAUDE.md §5.13's clock decision, and the same predicate
   * `PostgresBlogRepository` puts in SQL. Kept in one private method so the
   * list and the by-slug read cannot drift - a by-slug read that forgot the
   * clock would serve an unpublished post to anyone holding the link.
   */
  private isLive(post: BlogPost, now: number): boolean {
    if (post.status === 'draft') return false;
    if (post.status === 'published') return true;
    return Date.parse(post.publishAt) <= now;
  }

  async findLive(limit: number, offset: number): Promise<BlogPostWithMedia[]> {
    const now = Date.now();
    return this.sorted(this.posts.filter((p) => this.isLive(p, now)))
      .slice(offset, offset + limit)
      .map((p) => this.clone(p));
  }

  async findLiveBySlug(slug: string): Promise<BlogPostWithMedia | null> {
    const now = Date.now();
    const found = this.posts.find((p) => p.slug === slug && this.isLive(p, now));
    return found ? this.clone(found) : null;
  }

  async findAll(limit: number, offset: number): Promise<BlogPostWithMedia[]> {
    return this.sorted(this.posts)
      .slice(offset, offset + limit)
      .map((p) => this.clone(p));
  }

  async findById(postId: string): Promise<BlogPostWithMedia | null> {
    const found = this.posts.find((p) => p.id === postId);
    return found ? this.clone(found) : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    return this.posts.some((p) => p.slug === slug);
  }

  async create(input: NewBlogPost): Promise<BlogPostWithMedia> {
    const now = new Date().toISOString();
    const post: BlogPost = {
      ...input,
      tags: [...input.tags],
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.posts.push(post);
    return this.clone(post);
  }

  async update(
    postId: string,
    patch: BlogPostPatch,
  ): Promise<BlogPostWithMedia | null> {
    const index = this.posts.findIndex((p) => p.id === postId);
    const current = this.posts[index];
    if (index === -1 || !current) return null;

    // A replacement object rather than a mutation of the stored one, so any
    // `before` snapshot a caller is still holding stays what it was.
    const next: BlogPost = {
      ...current,
      ...patch,
      tags: patch.tags ? [...patch.tags] : [...current.tags],
      updatedAt: new Date().toISOString(),
    };
    this.posts[index] = next;
    return this.clone(next);
  }

  async remove(postId: string): Promise<boolean> {
    const index = this.posts.findIndex((p) => p.id === postId);
    if (index === -1) return false;
    this.posts.splice(index, 1);
    // The FK cascades in Postgres; here it has to be done by hand, or the
    // gallery outlives the post and shows up attached to nothing.
    for (let i = this.media.length - 1; i >= 0; i -= 1) {
      if (this.media[i]?.postId === postId) this.media.splice(i, 1);
    }
    return true;
  }

  async addMedia(input: NewBlogMedia): Promise<BlogMedia> {
    const item: BlogMedia = {
      ...input,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    this.media.push(item);
    return { ...item };
  }

  async findMedia(mediaId: string): Promise<BlogMedia | null> {
    const found = this.media.find((m) => m.id === mediaId);
    return found ? { ...found } : null;
  }

  async removeMedia(mediaId: string): Promise<boolean> {
    const index = this.media.findIndex((m) => m.id === mediaId);
    if (index === -1) return false;
    this.media.splice(index, 1);
    return true;
  }
}
