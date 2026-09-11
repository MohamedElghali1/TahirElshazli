import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffBlogController } from './staff-blog.controller.js';
import { PublicBlogController } from './public-blog.controller.js';
import { BlogService } from './blog.service.js';
import { BLOG_REPOSITORY } from './interfaces/blog-repository.interface.js';
import { InMemoryBlogRepository } from './repositories/in-memory-blog.repository.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { AUDIT_LOG_REPOSITORY } from '../audit/interfaces/audit-log-repository.interface.js';
import { InMemoryAuditLogRepository } from '../audit/repositories/in-memory-audit-log.repository.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Role } from '../auth/roles.enum.js';
import { slugify, uniqueSlug } from './slug.js';
import { isMediaUrl } from '../common/validators/is-media-url.validator.js';

const ADMIN = {
  user: { sub: 'teacher-1', email: 't@example.com', role: 'teacher', jti: 'j1' },
};
/** The author of the seeded `blog-2`, so they have one post they may edit. */
const AUTHOR_TA = {
  user: { sub: 'assistant-1', email: 'a1@example.com', role: 'assistant', jti: 'j2' },
};
/** Writes nothing in the fixtures, so every seeded post is somebody else's. */
const OTHER_TA = {
  user: { sub: 'assistant-2', email: 'a2@example.com', role: 'assistant', jti: 'j3' },
};

describe('Blog', () => {
  let staff: StaffBlogController;
  let pub: PublicBlogController;
  let audit: AuditService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StaffBlogController, PublicBlogController],
      providers: [
        BlogService,
        AuditService,
        // `AuditService.record` refuses to write outside a transaction
        // (CLAUDE.md §5.4), so the real `DatabaseService` is needed. A null
        // pool selects the memory driver, where `runInTransaction` is a
        // passthrough that still *enters* the context - which is what keeps
        // that assertion live in unit tests rather than only in production.
        DatabaseService,
        { provide: DATABASE_POOL, useValue: null },
        { provide: BLOG_REPOSITORY, useClass: InMemoryBlogRepository },
        { provide: USER_REPOSITORY, useClass: InMemoryUserRepository },
        { provide: AUDIT_LOG_REPOSITORY, useClass: InMemoryAuditLogRepository },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    staff = module.get(StaffBlogController);
    pub = module.get(PublicBlogController);
    audit = module.get(AuditService);
  });

  const entries = async () => (await audit.find({ limit: 50 })).entries;

  /* ------------------------------------------------------------------
     Publication. The whole point of the design is that no background job
     is involved, so these are the tests that would catch it regressing
     into one - or into a read that forgets the clock.
     ------------------------------------------------------------------ */

  describe('publication is a clock decision, not a stored flag', () => {
    it('shows a published post and hides a draft', async () => {
      const slugs = (await pub.list({})).map((p) => p.slug);
      expect(slugs).toContain('igcse-chemistry-results-june-2026');

      const draft = await staff.create(
        {
          title: 'Not finished yet',
          body: 'Half a thought.',
          status: 'draft',
        },
        ADMIN,
      );
      // Visible to its author on the staff list...
      expect((await staff.list({})).map((p) => p.id)).toContain(draft.id);
      // ...and to nobody on the public one.
      expect((await pub.list({})).map((p) => p.slug)).not.toContain(draft.slug);
    });

    it('shows a scheduled post whose time has passed', async () => {
      // `blog-2` is status 'scheduled' with a 2026 date. Nothing has flipped it
      // to 'published' and nothing ever will - if this fails, publication has
      // acquired a dependency on a job having run.
      const post = await pub.get('ielts-speaking-band-8-walkthrough');
      expect(post.title).toContain('Band 8');
    });

    it('hides a scheduled post whose time has not come', async () => {
      // `blog-3` is dated 2099. This is the assertion the fixture exists for.
      expect((await pub.list({})).map((p) => p.slug)).not.toContain(
        'october-intake-open-evening',
      );
      await expect(pub.get('october-intake-open-evening')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('404s a draft slug exactly as it 404s a slug that never existed', async () => {
      const draft = await staff.create(
        { title: 'Unpublished thing', body: 'x', status: 'draft' },
        ADMIN,
      );

      const forDraft = await pub.get(draft.slug).catch((e: unknown) => e);
      const forMissing = await pub.get('no-such-post').catch((e: unknown) => e);

      // Identical, so the response cannot be used to discover that a draft is
      // sitting there - the rule migration 004 set for unpublished courses.
      expect(forDraft).toBeInstanceOf(NotFoundException);
      expect(forMissing).toBeInstanceOf(NotFoundException);
      expect((forDraft as NotFoundException).message).toBe(
        (forMissing as NotFoundException).message,
      );
    });

    it('derives isLive for staff without rewriting the row', async () => {
      const list = await staff.list({});
      const scheduledAndLive = list.find((p) => p.id === 'blog-2');
      const scheduledAndNot = list.find((p) => p.id === 'blog-3');

      // Still 'scheduled' in both cases: the status is history, `isLive` is the
      // derived answer (CLAUDE.md §5.10).
      expect(scheduledAndLive?.status).toBe('scheduled');
      expect(scheduledAndLive?.isLive).toBe(true);
      expect(scheduledAndNot?.status).toBe('scheduled');
      expect(scheduledAndNot?.isLive).toBe(false);
    });
  });

  /* ------------------------------------------------------------------
     The public projection
     ------------------------------------------------------------------ */

  describe('the public projection', () => {
    it('carries a byline and withholds internal fields', async () => {
      const post = await pub.get('igcse-chemistry-results-june-2026');

      expect(post.authorName).toBe('Dr. Tahir Elshazli');
      // An internal id, a status that would read as "not out yet", and a flag
      // that is trivially true on this route.
      expect(post).not.toHaveProperty('authorId');
      expect(post).not.toHaveProperty('status');
      expect(post).not.toHaveProperty('isLive');
    });

    it('falls back to the body when there is no excerpt', async () => {
      // `blog-2` has excerpt: null.
      const post = await pub.get('ielts-speaking-band-8-walkthrough');
      expect(post.summary).toContain('Two students agreed');
      // Collapsed to one line, so a card does not render a paragraph break.
      expect(post.summary).not.toContain('\n');
    });

    it('treats an emptied excerpt as absent, not as an empty summary', async () => {
      // `@IsOptional()` skips only null and undefined, so an author who clears
      // the standfirst sends `''` - which validates. Stored as-is it would
      // defeat `excerpt ?? summarise(body)`, because `''` is not nullish, and
      // every card for the post would render a blank summary.
      const created = await staff.create(
        {
          title: 'Cleared standfirst',
          body: 'The body still has to stand in for the missing standfirst.',
          excerpt: '   ',
          status: 'published',
        },
        ADMIN,
      );
      expect(created.excerpt).toBeNull();
      expect(created.summary).toContain('The body still has to stand in');

      // And on the patch path, which is where an author actually clears it.
      const cleared = await staff.update('blog-1', { excerpt: '' }, ADMIN);
      expect(cleared.excerpt).toBeNull();
      expect(cleared.summary).toContain('Ninety-one students sat');
    });

    it('returns the gallery in the author order, images and video together', async () => {
      const post = await pub.get('igcse-chemistry-results-june-2026');
      // The case a single `featured_image_url` column could not express, which
      // is why media is its own table (§5.19).
      expect(post.media.map((m) => m.kind)).toEqual(['image', 'video']);
      expect(post.media.map((m) => m.position)).toEqual([0, 1]);
    });
  });

  /* ------------------------------------------------------------------
     Authoring, and who may do it
     ------------------------------------------------------------------ */

  describe('authoring', () => {
    it('lets an assistant publish a post with a gallery', async () => {
      // The client's instruction on 2026-09-10 named the assistant as an
      // author, overriding §2.2's "cannot touch the CMS" preset.
      const post = await staff.create(
        {
          title: 'Top of the governorate in Paper 2',
          body: 'Three of our students placed in the top ten.',
          status: 'published',
          media: [
            {
              kind: 'image',
              url: 'https://cdn.example.com/blog/paper-2.jpg',
              caption: 'The certificate.',
            },
            { kind: 'file', url: '/uploads/b3f1c0de-0000-4000-8000-000000000001.pdf' },
          ],
        },
        AUTHOR_TA,
      );

      expect(post.slug).toBe('top-of-the-governorate-in-paper-2');
      expect(post.media).toHaveLength(2);
      // Positions come from the array's order, never from the client.
      expect(post.media.map((m) => m.position)).toEqual([0, 1]);
      // Reaches the student and visitor surface, which is the acceptance test
      // §5.18 sets for authoring generally: the thing appears where it is read.
      expect((await pub.list({})).map((p) => p.slug)).toContain(post.slug);
    });

    it('defaults to a draft rather than publishing by omission', async () => {
      const post = await staff.create({ title: 'Later', body: 'x' }, ADMIN);
      expect(post.status).toBe('draft');
      expect(post.isLive).toBe(false);
    });

    it('defaults to the achievement category, which is what was asked for', async () => {
      const post = await staff.create({ title: 'A win', body: 'x' }, ADMIN);
      expect(post.category).toBe('achievement');
    });

    it('keeps the slug when the title is edited', async () => {
      const post = await staff.create(
        { title: 'Origional spelling', body: 'x', status: 'published' },
        ADMIN,
      );
      const fixed = await staff.update(post.id, { title: 'Original spelling' }, ADMIN);

      // A slug that moved would break every link already shared, so a typo fix
      // does not get to change the address.
      expect(fixed.slug).toBe(post.slug);
      expect(fixed.title).toBe('Original spelling');
    });

    it('gives a duplicate title a distinct, still-readable slug', async () => {
      const a = await staff.create({ title: 'Results day', body: 'x' }, ADMIN);
      const b = await staff.create({ title: 'Results day', body: 'y' }, ADMIN);
      expect(a.slug).toBe('results-day');
      expect(b.slug).toBe('results-day-2');
    });

    it('replaces the gallery as a set', async () => {
      const before = await staff.get('blog-1');
      expect(before.media).toHaveLength(2);

      const after = await staff.setMedia(
        'blog-1',
        { media: [{ kind: 'image', url: 'https://cdn.example.com/one.png' }] },
        ADMIN,
      );
      expect(after.media).toHaveLength(1);
      expect(after.media[0]?.url).toBe('https://cdn.example.com/one.png');
    });

    it('keeps a post moved to scheduled from going live immediately', async () => {
      const post = await staff.create({ title: 'Pending', body: 'x' }, ADMIN);
      // No publishAt supplied. Without the service carrying the existing date
      // forward this would be dated "now", i.e. instantly live - the opposite
      // of scheduling it.
      const scheduled = await staff.update(post.id, { status: 'scheduled' }, ADMIN);
      expect(scheduled.publishAt).toBe(post.publishAt);
    });
  });

  describe('who may change a post', () => {
    it('lets an assistant edit their own', async () => {
      // `blog-2` is authored by assistant-1 in the fixtures.
      const updated = await staff.update(
        'blog-2',
        { title: 'What Band 8 sounds like' },
        AUTHOR_TA,
      );
      expect(updated.title).toBe('What Band 8 sounds like');
    });

    it('refuses an assistant editing or deleting somebody else\'s', async () => {
      await expect(
        staff.update('blog-1', { title: 'Mine now' }, OTHER_TA),
      ).rejects.toThrow(ForbiddenException);
      await expect(staff.remove('blog-1', OTHER_TA)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(
        staff.setMedia('blog-1', { media: [] }, OTHER_TA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets the teacher change anything, including an assistant\'s post', async () => {
      const updated = await staff.update('blog-2', { status: 'published' }, ADMIN);
      expect(updated.status).toBe('published');
    });

    it('404s an unknown post before it decides who may touch it', async () => {
      // Order matters: a 403 here would confirm that some post has that id.
      await expect(
        staff.update('no-such-post', { title: 'x' }, OTHER_TA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  /* ------------------------------------------------------------------
     The audit trail (CLAUDE.md §5.4)
     ------------------------------------------------------------------ */

  describe('the audit trail', () => {
    it('records a create with the author role it was actually done under', async () => {
      await staff.create(
        { title: 'An assistant post', body: 'x', status: 'published' },
        AUTHOR_TA,
      );

      const [entry] = await entries();
      expect(entry?.action).toBe('blog_post.created');
      expect(entry?.targetType).toBe('blog_post');
      // Derived from the acting user, never assumed. A TA's post must not read
      // as Dr. Tahir's in the log - which matters here more than usual, since
      // the public byline comes from the same id.
      expect(entry?.actorRole).toBe(Role.Assistant);
      expect(entry?.before).toBeNull();
      expect(entry?.after?.status).toBe('published');
    });

    it('records an update with a before/after pair that actually differs', async () => {
      await staff.update('blog-1', { title: 'A stronger headline' }, ADMIN);

      const [entry] = await entries();
      expect(entry?.action).toBe('blog_post.updated');
      // The aliasing defect §7.1 records finding twice: if the repository hands
      // back the stored object by reference, these two read identical and the
      // entry is evidence-shaped and empty.
      expect(entry?.before?.title).toBe(
        'June 2026: 34 A* grades across the Chemistry cohorts',
      );
      expect(entry?.after?.title).toBe('A stronger headline');
      expect(entry?.before?.title).not.toBe(entry?.after?.title);
    });

    it('records a publish as the status transition it is', async () => {
      const post = await staff.create({ title: 'Soon', body: 'x' }, ADMIN);
      await staff.update(post.id, { status: 'published' }, ADMIN);

      const [entry] = await entries();
      // No separate `blog_post.published` action: the pair carries it, so an
      // edit that both fixed a typo and published is one entry, not two.
      expect(entry?.before?.status).toBe('draft');
      expect(entry?.after?.status).toBe('published');
    });

    it('records a delete with what was lost, since nothing can read it after', async () => {
      await staff.remove('blog-1', ADMIN);

      const [entry] = await entries();
      expect(entry?.action).toBe('blog_post.deleted');
      expect(entry?.before?.slug).toBe('igcse-chemistry-results-june-2026');
      expect(entry?.before?.mediaCount).toBe(2);
      expect(entry?.after).toBeNull();

      // And it is actually gone from both surfaces.
      await expect(pub.get('igcse-chemistry-results-june-2026')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('records a gallery replacement separately from an edit', async () => {
      await staff.setMedia(
        'blog-1',
        { media: [{ kind: 'image', url: 'https://cdn.example.com/x.png' }] },
        ADMIN,
      );
      const [entry] = await entries();
      expect(entry?.action).toBe('blog_post.media_set');
      expect(entry?.before?.mediaCount).toBe(2);
      expect(entry?.after?.mediaCount).toBe(1);
    });

    it('audits every mutating route on the controller', async () => {
      // Enumerated rather than assumed. §7.1 is explicit that audit coverage is
      // a property of the tree and not a mechanism, so each new write has to
      // bring its own assertion or §5.4 breaks silently.
      const post = await staff.create({ title: 'Everything', body: 'x' }, ADMIN);
      await staff.update(post.id, { body: 'y' }, ADMIN);
      await staff.setMedia(post.id, { media: [] }, ADMIN);
      await staff.remove(post.id, ADMIN);

      const actions = (await entries()).map((e) => e.action);
      expect(actions).toEqual([
        'blog_post.deleted',
        'blog_post.media_set',
        'blog_post.updated',
        'blog_post.created',
      ]);
    });
  });
});

/* --------------------------------------------------------------------
   The two pure helpers, tested directly.
   -------------------------------------------------------------------- */

describe('slugify', () => {
  it.each([
    ['June 2026: 34 A* grades!', 'june-2026-34-a-grades'],
    ['  Trailing and   leading  ', 'trailing-and-leading'],
    ['Café résumé', 'cafe-resume'],
    ['IELTS/IGCSE — both', 'ielts-igcse-both'],
  ])('turns %s into %s', (title, expected) => {
    expect(slugify(title)).toBe(expected);
  });

  it('returns empty for a title with nothing ASCII in it', () => {
    // CLAUDE.md §4 allows Arabic content, and this is the documented
    // limitation rather than a surprise: `uniqueSlug` supplies a dated
    // fallback so the post still gets a usable address.
    expect(slugify('نتائج الكيمياء')).toBe('');
  });

  it('caps the length', () => {
    expect(slugify('word '.repeat(60)).length).toBeLessThanOrEqual(80);
  });

  it('never ends in a hyphen, even when the cap lands on one', () => {
    expect(slugify('a'.repeat(79) + ' b')).not.toMatch(/-$/);
  });
});

describe('uniqueSlug', () => {
  it('falls back to a dated slug when the title yields nothing', async () => {
    const slug = await uniqueSlug(
      'نتائج الكيمياء',
      async () => false,
      new Date('2026-09-10T00:00:00Z'),
    );
    expect(slug).toBe('post-2026-09-10');
  });

  it('gives up counting after a pathological number of collisions', async () => {
    // Always-taken. Without the bound this would loop issuing queries forever.
    const slug = await uniqueSlug('taken', async () => true, new Date(0));
    expect(slug).toBe('taken-0');
  });
});

describe('isMediaUrl', () => {
  it.each([
    'https://cdn.example.com/blog/a.jpg',
    '/uploads/b3f1c0de-0000-4000-8000-000000000001.pdf',
  ])('accepts %s', (url) => {
    expect(isMediaUrl(url)).toBe(true);
  });

  it.each([
    // Traversal out of the upload root, in the two shapes it arrives as.
    '/uploads/../../.env',
    '/uploads/nested/file.png',
    // A relative path that is not an upload at all. Accepting these would turn
    // a media field into a way to point the page at any route on the API.
    '/api/admin/students',
    '/etc/passwd',
    'uploads/no-leading-slash.png',
    // Inherited from `isPublicHttpUrl`: schemes and hosts that must not appear.
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:3001/uploads/x.png',
  ])('rejects %s', (url) => {
    expect(isMediaUrl(url)).toBe(false);
  });
});
