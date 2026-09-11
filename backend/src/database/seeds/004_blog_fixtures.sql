-- 004_blog_fixtures.sql
--
-- Development fixtures for the blog (CLAUDE.md §5.19). Runs after 001-003 and,
-- like them, is idempotent - the seeder re-runs every file on every invocation.
--
-- These mirror `InMemoryBlogRepository`'s seed exactly, ids included. The two
-- drivers backing the same interface should show a developer the same screen,
-- and a fixture that differs between them turns "does this work?" into "which
-- driver am I on?".
--
-- The set is chosen around the **statuses**, because that is what is easy to
-- get wrong and impossible to eyeball. Publication here is a clock comparison
-- performed on read and no background job flips any row, so the fixture has to
-- contain one of each case for that predicate to be exercised at all:
--
--   blog-1  published                       -> always live
--   blog-2  scheduled, publish_at in 2026   -> live, and the row still says
--                                              'scheduled', which is the point
--   blog-3  scheduled, publish_at in 2099   -> must NEVER appear publicly
--
-- blog-3 is the load-bearing one. A seed with only live posts cannot fail the
-- "a future-dated post is invisible" test, the same way 002's unassigned course
-- is what makes the TA scoping test meaningful.
--
-- blog-2 is authored by `assistant-1` deliberately: the client's instruction on
-- 2026-09-10 named the assistant as an author too, and `assertMayMutate` lets a
-- TA edit only their own posts. With every fixture written by teacher-1 there
-- would be nothing for an assistant to legitimately edit, and nothing to check
-- the refusal against either.

INSERT INTO blog_posts
  (id, slug, title, excerpt, body, category, tags, status, publish_at, author_id, created_at, updated_at)
VALUES
  (
    'blog-1',
    'igcse-chemistry-results-june-2026',
    'June 2026: 34 A* grades across the Chemistry cohorts',
    'The June series results are in, and they are the strongest set this programme has produced.',
    E'Ninety-one students sat IGCSE Chemistry this June across the Saturday and Tuesday groups. Thirty-four came away with an A*, and every student who completed the full past-paper programme placed in the top two grades.\n\nWhat changed this year was the marking turnaround. Every paper came back annotated inside a week, which meant nobody spent a month repeating a mistake they had already made.',
    'achievement',
    ARRAY['IGCSE', 'Chemistry', 'Results'],
    'published',
    '2026-08-22T09:00:00Z',
    'teacher-1',
    '2026-08-20T14:00:00Z',
    '2026-08-22T09:00:00Z'
  ),
  (
    'blog-2',
    'ielts-speaking-band-8-walkthrough',
    'What a Band 8 speaking answer actually sounds like',
    NULL,
    E'Two students agreed to have their Part 2 answers recorded and pulled apart. Both scored Band 8; neither used a word you would not already know.\n\nThe difference is in what they do when they run out of things to say, and that is the part nobody teaches.',
    'article',
    ARRAY['IELTS', 'Speaking'],
    'scheduled',
    '2026-09-01T06:00:00Z',
    'assistant-1',
    '2026-08-28T11:00:00Z',
    '2026-08-28T11:00:00Z'
  ),
  (
    'blog-3',
    'october-intake-open-evening',
    'Open evening for the October intake',
    'Dated far enough ahead that no public read should return it.',
    'Details of the October intake open evening, with the timetable for both the IGCSE and IELTS tracks.',
    'resource',
    ARRAY['Admissions'],
    'scheduled',
    '2099-10-01T17:00:00Z',
    'teacher-1',
    '2026-09-05T08:00:00Z',
    '2026-09-05T08:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

-- The gallery. One post carries an image *and* a video, which is the case
-- `featured_image_url` could not have expressed and the reason media is its own
-- table (§5.19). Another carries a `file`, so all three render branches -
-- <img>, a player, a download link - have a row to exercise.
--
-- Every URL is an absolute `cdn.example.com` one rather than a `/uploads/...`
-- path. A seeded upload path would point at a file that does not exist on this
-- developer's disk, so the gallery would render as broken images and look like
-- a bug in the upload endpoint. An obviously-fictional CDN host reads as a
-- fixture.
INSERT INTO blog_post_media
  (id, post_id, kind, url, caption, mime_type, size_bytes, position, created_at)
VALUES
  (
    'blog-media-1', 'blog-1', 'image',
    'https://cdn.example.com/blog/results-board-june-2026.jpg',
    'The grade distribution for both Chemistry groups, June 2026.',
    'image/jpeg', 412338, 0, '2026-08-20T14:05:00Z'
  ),
  (
    'blog-media-2', 'blog-1', 'video',
    'https://cdn.example.com/blog/results-assembly-2026.mp4',
    'Results morning at the Maadi centre.',
    'video/mp4', 18774102, 1, '2026-08-20T14:09:00Z'
  ),
  (
    'blog-media-3', 'blog-2', 'file',
    'https://cdn.example.com/blog/band-8-transcripts.pdf',
    'Both answers, transcribed with the examiner criteria alongside.',
    'application/pdf', 96140, 0, '2026-08-28T11:12:00Z'
  )
ON CONFLICT (id) DO NOTHING;
