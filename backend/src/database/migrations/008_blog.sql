-- 008_blog.sql
--
-- The blog: Dr. Tahir's achievements, in his own words, with the pictures.
--
-- Asked for directly on 2026-09-10: *"a blog page where the teacher, or ta can
-- upload data (images, videos..etc) with description and the students can view
-- it - think of it like a place of teacher achievements the students can
-- view."* CLAUDE.md §5.19 is the requirement; §6.1's `BlogPost` is the entity
-- slot this fills, and it settles §11's `Post` vs `BlogPost` naming collision
-- in favour of the specific spelling.
--
-- Two tables, and the split is the whole point of the instruction. A post is
-- one piece of writing; the *"images, videos..etc"* is a list, not a column, so
-- the media hangs off the post rather than being one `featured_image_url` on
-- it.
--
-- Conventions follow 001-007: TEXT primary keys, TIMESTAMPTZ stored UTC,
-- millisecond precision on anything a keyset cursor might later read.

-- ============================================================
-- 1. BLOG_POSTS  (CLAUDE.md §5.19, §6.1)
-- ============================================================

CREATE TABLE blog_posts (
  id         TEXT PRIMARY KEY,

  -- The public URL. Keyed by slug and not by id for the same reason
  -- `courses.slug` is (migration 004): this is a shareable marketing address
  -- and an id is internal. UNIQUE because two posts answering the same URL is
  -- a coin toss, and the service appends a discriminator rather than let the
  -- insert decide.
  slug       TEXT NOT NULL UNIQUE,

  title      TEXT NOT NULL,

  -- The one-line standfirst the index and the card render. Nullable: a post
  -- with no excerpt falls back to the opening of `body`, computed on read, so
  -- nothing has to be written twice and then drift.
  excerpt    TEXT,

  -- The client's "description". Long-form, and the reason this is TEXT rather
  -- than a capped VARCHAR - an achievement worth posting comes with a story.
  body       TEXT NOT NULL,

  -- What kind of post it is. The client's framing is *achievements*, and that
  -- is the default, but they called the surface a blog - so the union carries
  -- the other two things a blog on this site would plausibly hold rather than
  -- pretending the feed is only ever one thing.
  category   TEXT NOT NULL DEFAULT 'achievement'
             CHECK (category IN ('achievement', 'article', 'resource')),

  -- §6.1 names `tags[]`. A real array rather than a join table: nothing
  -- queries *across* tags, the cardinality is a handful per post, and a
  -- `blog_post_tags` table would be three joins to render a row of chips.
  tags       TEXT[] NOT NULL DEFAULT '{}',

  -- §6.1's three states, unchanged.
  status     TEXT NOT NULL DEFAULT 'draft'
             CHECK (status IN ('draft', 'scheduled', 'published')),

  -- When it goes (or went) live.
  --
  -- NOT NULL with a now() default, so every row has an orderable date and the
  -- feed's sort key is never a coalesce. A draft carries one too; it is simply
  -- never read, because a draft is invisible whatever this says.
  publish_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),

  -- RESTRICT by omission, like every other actor reference in this schema: an
  -- account that authored posts cannot be hard-deleted out from under them.
  author_id  TEXT NOT NULL REFERENCES users (id),

  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- The public feed, and the only index the anonymous reads need.
--
-- Partial on `status <> 'draft'` because a draft is not reachable from any
-- public or student route, so it has no business in the index that serves them.
-- The predicate this is built for is the one in `PostgresBlogRepository`:
--
--   status = 'published' OR (status = 'scheduled' AND publish_at <= now())
--
-- which is CLAUDE.md §5.13's "publication is a server-side clock decision"
-- taken literally. There is deliberately **no background job flipping
-- `scheduled` to `published`** - the read compares `publish_at` to now(), so a
-- scheduled post becomes visible on time whether or not anything was running
-- at that moment, and no row has to be rewritten for it to happen. What that
-- costs is that a scheduled post whose time has passed still *says*
-- 'scheduled' in the admin list; the service derives an `isLive` flag for it
-- rather than mutating history.
CREATE INDEX blog_posts_live_idx
  ON blog_posts (publish_at DESC, id DESC)
  WHERE status <> 'draft';

-- The staff console's list, which unlike the public one includes drafts.
CREATE INDEX blog_posts_author_id_idx ON blog_posts (author_id);

-- ============================================================
-- 2. BLOG_POST_MEDIA: the "images, videos..etc"  (§5.19, §8)
-- ============================================================

-- Its own table because the client's word was plural. §6.1 gives `BlogPost` a
-- single `featured_image_url`, which is one image and cannot hold a video at
-- all; an achievements post is a certificate *and* a photo *and* a clip of the
-- results assembly. So there is no `featured_image_url` column above - the
-- cover is the first image in this table, which keeps one source of truth
-- instead of a column that can disagree with the gallery beside it.
CREATE TABLE blog_post_media (
  id         TEXT PRIMARY KEY,

  -- CASCADE: an attachment has no meaning without its post, unlike an audit
  -- entry, which must outlive what it describes.
  post_id    TEXT NOT NULL REFERENCES blog_posts (id) ON DELETE CASCADE,

  -- How the page should render it, decided at write time and not sniffed from
  -- the extension on read. Three kinds and not a MIME string, because the
  -- renderer has exactly three branches: <img>, a player, and a download link.
  kind       TEXT NOT NULL CHECK (kind IN ('image', 'video', 'file')),

  -- Either a URL on a public host, or a root-relative path this server minted
  -- itself through the upload endpoint. `IsBlogMediaUrl` is the one place that
  -- decides which shapes are acceptable, and it deliberately does **not**
  -- accept an arbitrary relative path - only `/uploads/<name>`, which is what
  -- our own storage produces.
  url        TEXT NOT NULL,

  -- The per-item description. The client asked for a description on the upload,
  -- and a gallery of five certificates with one paragraph between them does not
  -- answer that - each item gets its own line.
  caption    TEXT,

  -- What the server determined the file to be, for the items it stored itself.
  -- Nullable: an externally-hosted URL has no MIME type we can vouch for, and
  -- recording a guess would be worse than recording nothing.
  mime_type  TEXT,
  size_bytes BIGINT CHECK (size_bytes IS NULL OR size_bytes >= 0),

  -- Gallery order, set by the author. Not `created_at`: reordering an existing
  -- gallery must not require re-uploading it.
  position   INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

-- "The media for this post, in the author's order." Ends with the id so two
-- items sharing a position still come back in a stable sequence - the same
-- tie-break every other index in this schema carries.
CREATE INDEX blog_post_media_post_id_position_idx
  ON blog_post_media (post_id, position, id);
