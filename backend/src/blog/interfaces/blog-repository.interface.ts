/**
 * The blog: Dr. Tahir's achievements, with the images and video that make them
 * worth reading (CLAUDE.md §5.19).
 *
 * Two entities, because the client's word was plural - *"images, videos..etc
 * with description"*. A post is one piece of writing; its media is a list.
 */

/** §6.1's three states, and nothing derived. `isLive` is computed on read. */
export type BlogPostStatus = 'draft' | 'scheduled' | 'published';

export const BLOG_POST_STATUSES: readonly BlogPostStatus[] = [
  'draft',
  'scheduled',
  'published',
];

/**
 * What kind of post it is.
 *
 * `achievement` is the default and the client's own framing. The other two
 * exist because they called the surface a *blog*, and a feed that can only
 * hold trophies would need a second feature the first time Dr. Tahir wants to
 * post a worked exam question.
 */
export type BlogCategory = 'achievement' | 'article' | 'resource';

export const BLOG_CATEGORIES: readonly BlogCategory[] = [
  'achievement',
  'article',
  'resource',
];

/**
 * How the page renders an attachment. Three kinds rather than a MIME string,
 * because the renderer has exactly three branches: an `<img>`, a player, and a
 * download link. Deciding at write time also means a stored file and an
 * externally-hosted URL are rendered by the same rule.
 */
export type BlogMediaKind = 'image' | 'video' | 'file';

export const BLOG_MEDIA_KINDS: readonly BlogMediaKind[] = [
  'image',
  'video',
  'file',
];

export interface BlogMedia {
  id: string;
  postId: string;
  kind: BlogMediaKind;
  url: string;
  /** The per-item description the client asked for. */
  caption: string | null;
  /**
   * Null for an externally-hosted URL. We record what our own storage
   * determined and never a guess made from an extension - a wrong MIME type in
   * the database is worse than none, because the next reader trusts it.
   */
  mimeType: string | null;
  sizeBytes: number | null;
  position: number;
  createdAt: string;
}

export type NewBlogMedia = Omit<BlogMedia, 'id' | 'createdAt'>;

export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  category: BlogCategory;
  tags: string[];
  status: BlogPostStatus;
  publishAt: string;
  authorId: string;
  createdAt: string;
  updatedAt: string;
}

/** A post and its gallery, which is the only shape any screen actually wants. */
export interface BlogPostWithMedia extends BlogPost {
  media: BlogMedia[];
}

/** `id`, `createdAt` and `updatedAt` are the repository's to assign. */
export type NewBlogPost = Omit<BlogPost, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * A partial edit. `slug` is absent deliberately: changing it breaks every link
 * anyone has shared, so a retitled post keeps the address it was published
 * under. If that is ever wanted it should be an explicit, separate action with
 * a redirect behind it, not a side effect of fixing a typo.
 */
export type BlogPostPatch = Partial<
  Pick<
    BlogPost,
    'title' | 'excerpt' | 'body' | 'category' | 'tags' | 'status' | 'publishAt'
  >
>;

export interface BlogRepository {
  /**
   * The public and student feed: published posts, plus scheduled ones whose
   * time has come.
   *
   * The clock comparison lives **inside** the repository rather than in the
   * service, so both drivers answer the same question and neither read can
   * forget it. CLAUDE.md §5.13: publication is a server-side clock decision,
   * never something a reader computes - and here it is also never something a
   * background job has to have been running for.
   */
  findLive(limit: number, offset: number): Promise<BlogPostWithMedia[]>;

  /** One live post by slug. Returns null for a draft, exactly as for a miss. */
  findLiveBySlug(slug: string): Promise<BlogPostWithMedia | null>;

  /** Everything, drafts included. Staff only; the controller enforces that. */
  findAll(limit: number, offset: number): Promise<BlogPostWithMedia[]>;

  /** By id, whatever its status. The read behind every staff mutation. */
  findById(postId: string): Promise<BlogPostWithMedia | null>;

  /** Whether a slug is taken. Used to mint a unique one before inserting. */
  slugExists(slug: string): Promise<boolean>;

  create(input: NewBlogPost): Promise<BlogPostWithMedia>;
  update(postId: string, patch: BlogPostPatch): Promise<BlogPostWithMedia | null>;
  /** Cascades to the post's media, as the FK does. */
  remove(postId: string): Promise<boolean>;

  addMedia(input: NewBlogMedia): Promise<BlogMedia>;
  /** Looked up on its own so a delete can check which post it belongs to. */
  findMedia(mediaId: string): Promise<BlogMedia | null>;
  removeMedia(mediaId: string): Promise<boolean>;
}

export const BLOG_REPOSITORY = Symbol('BLOG_REPOSITORY');
