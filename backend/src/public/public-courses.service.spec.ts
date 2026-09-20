import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PublicCoursesService } from './public-courses.service.js';
import type {
  CourseRepository,
  StoredCourse,
} from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';

const published: StoredCourse = {
  id: 'course-1',
  slug: 'as-chemistry',
  isPublished: true,
  title: 'AS Chemistry',
  description: 'Complete AS-level Chemistry',
  thumbnailUrl: null,
  teacherName: 'Dr. Tahir Elshazli',
  sequentialLockEnabled: true,
  modules: [
    {
      id: 'mod-1',
      title: 'Atomic Structure',
      chapter: 'Chapter 1',
      order: 1,
      lessons: [
        { id: 'lesson-1', title: 'Basics', order: 1, durationSeconds: 100 },
        { id: 'lesson-2', title: 'Configuration', order: 2, durationSeconds: 200 },
      ],
    },
    // A module with no lessons yet - it must still be counted and returned,
    // or a half-built course reads as if the chapter does not exist.
    { id: 'mod-2', title: 'Moles', chapter: 'Chapter 2', order: 2, lessons: [] },
  ],
};

const draft: StoredCourse = {
  ...published,
  id: 'course-2',
  slug: 'unannounced-a-level',
  isPublished: false,
  title: 'Unannounced A Level',
};

/**
 * A stub rather than `InMemoryCourseRepository`: the point of these tests is
 * that the *service* never shows a draft, and the shipped in-memory fixtures
 * are all published, so they could not fail the assertion that matters.
 */
class StubCourseRepository implements CourseRepository {
  constructor(private readonly courses: StoredCourse[]) {}
  async findById(id: string) {
    return this.courses.find((c) => c.id === id) ?? null;
  }
  async findByIds(ids: readonly string[]) {
    const wanted = new Set(ids);
    return this.courses.filter((c) => wanted.has(c.id));
  }
  async findAll(limit: number, offset: number) {
    return this.courses.slice(offset, offset + limit);
  }
  async findPublished(limit: number, offset: number) {
    return this.courses.filter((c) => c.isPublished).slice(offset, offset + limit);
  }
  async findBySlug(slug: string) {
    return this.courses.find((c) => c.slug === slug) ?? null;
  }
}

async function build(courses: StoredCourse[]): Promise<PublicCoursesService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PublicCoursesService,
      { provide: COURSE_REPOSITORY, useValue: new StubCourseRepository(courses) },
    ],
  }).compile();
  return module.get(PublicCoursesService);
}

describe('PublicCoursesService', () => {
  it('lists published courses with outline counts and total duration', async () => {
    const service = await build([published, draft]);

    const list = await service.listCourses();

    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({
      id: 'course-1',
      slug: 'as-chemistry',
      title: 'AS Chemistry',
      description: 'Complete AS-level Chemistry',
      thumbnailUrl: null,
      teacherName: 'Dr. Tahir Elshazli',
      moduleCount: 2,
      lessonCount: 2,
      totalDurationSeconds: 300,
    });
  });

  it('omits unpublished courses from the list', async () => {
    const service = await build([published, draft]);

    const slugs = (await service.listCourses()).map((c) => c.slug);

    expect(slugs).not.toContain('unannounced-a-level');
  });

  it('returns the full outline for a published course', async () => {
    const service = await build([published]);

    const detail = await service.getCourseBySlug('as-chemistry');

    expect(detail.modules).toHaveLength(2);
    expect(detail.modules[0].lessons.map((l) => l.title)).toEqual([
      'Basics',
      'Configuration',
    ]);
    expect(detail.modules[1].lessons).toEqual([]);
  });

  /**
   * The mapping in `toSummary`/`getCourseBySlug` is the boundary that keeps
   * storage fields off the public internet. If someone replaces it with a
   * spread, this is the test that notices.
   */
  it('does not leak storage-only fields onto the public shape', async () => {
    const service = await build([published]);

    const detail = await service.getCourseBySlug('as-chemistry');

    expect(detail).not.toHaveProperty('isPublished');
    expect(detail).not.toHaveProperty('sequentialLockEnabled');
    expect(detail).not.toHaveProperty('defaultLearningMode');
  });

  it('404s an unpublished course rather than 403ing it', async () => {
    const service = await build([published, draft]);

    await expect(
      service.getCourseBySlug('unannounced-a-level'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  /**
   * The draft and the nonexistent slug must be indistinguishable, or the
   * response itself confirms an unannounced course exists - the same rule
   * `StaffScopeService` follows for an unassigned course (CLAUDE.md §5.11).
   */
  it('answers a draft slug and an unknown slug identically', async () => {
    const service = await build([published, draft]);

    const asDraft = await service
      .getCourseBySlug('unannounced-a-level')
      .catch((e: NotFoundException) => e.getResponse());
    const asUnknown = await service
      .getCourseBySlug('no-such-course')
      .catch((e: NotFoundException) => e.getResponse());

    expect(asDraft).toEqual(asUnknown);
  });
});
