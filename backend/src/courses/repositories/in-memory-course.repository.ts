import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  CoursePatch,
  CourseRepository,
  NewCourse,
  StoredCourse,
} from '../interfaces/course-repository.interface.js';

const STUB_COURSES: StoredCourse[] = [
  {
    id: 'course-1',
    slug: 'as-chemistry',
    isPublished: true,
    title: 'AS Chemistry',
    description: 'Complete AS-level Chemistry course with Dr. Tahir',
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
          { id: 'lesson-1', title: 'Atomic Structure Basics', order: 1, durationSeconds: 2400 },
          { id: 'lesson-2', title: 'Electron Configuration', order: 2, durationSeconds: 2100 },
          { id: 'lesson-3', title: 'Ionisation Energy', order: 3, durationSeconds: 1980 },
          { id: 'lesson-4', title: 'The Periodic Table', order: 4, durationSeconds: 1800 },
        ],
      },
      {
        id: 'mod-2',
        title: 'Moles & Stoichiometry',
        chapter: 'Chapter 2',
        order: 2,
        lessons: [
          { id: 'lesson-5', title: 'The Mole Concept', order: 1, durationSeconds: 2700 },
          { id: 'lesson-6', title: 'Empirical & Molecular Formulae', order: 2, durationSeconds: 2280 },
          { id: 'lesson-7', title: 'Titration Calculations', order: 3, durationSeconds: 3000 },
          { id: 'lesson-8', title: 'Gas Volumes', order: 4, durationSeconds: 1920 },
        ],
      },
      {
        id: 'mod-3',
        title: 'Organic Chemistry',
        chapter: 'Chapter 3',
        order: 3,
        lessons: [
          { id: 'lesson-9', title: 'Alkanes', order: 1, durationSeconds: 2520 },
          { id: 'lesson-10', title: 'Alkenes', order: 2, durationSeconds: 2640 },
          { id: 'lesson-11', title: 'Alcohols', order: 3, durationSeconds: 2400 },
          { id: 'lesson-12', title: 'Halogenoalkanes', order: 4, durationSeconds: 2160 },
        ],
      },
    ],
  },
  {
    id: 'course-2',
    slug: 'ielts-preparation-live',
    isPublished: true,
    title: 'IELTS Preparation - Live',
    description: 'Live IELTS preparation course',
    thumbnailUrl: null,
    teacherName: 'Dr. Tahir Elshazli',
    sequentialLockEnabled: false,
    modules: [
      {
        id: 'mod-4',
        title: 'Speaking & Listening',
        chapter: 'Chapter 1',
        order: 1,
        lessons: [
          { id: 'lesson-13', title: 'Introduction to IELTS Speaking', order: 1, durationSeconds: 3600 },
        ],
      },
    ],
  },
];


@Injectable()
export class InMemoryCourseRepository implements CourseRepository {
  /**
   * A per-instance copy of the fixtures, not the shared module constant.
   *
   * It became writable with `create`/`update` (`DOM-5`), and a shared array
   * would let a course authored in one spec appear in the next - the kind of
   * cross-test leakage that makes a suite pass in one order and fail in
   * another. Every other in-memory driver here already holds its rows on the
   * instance.
   */
  private courses: StoredCourse[] = STUB_COURSES.map((c) => ({ ...c }));

  async findById(courseId: string): Promise<StoredCourse | null> {
    return this.courses.find((c) => c.id === courseId) ?? null;
  }

  async findAll(limit: number, offset: number): Promise<StoredCourse[]> {
    return [...this.courses]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(offset, offset + limit);
  }

  async findPublished(limit: number, offset: number): Promise<StoredCourse[]> {
    return this.courses
      .filter((c) => c.isPublished)
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(offset, offset + limit);
  }

  async findBySlug(slug: string): Promise<StoredCourse | null> {
    return this.courses.find((c) => c.slug === slug) ?? null;
  }

  async findByIds(courseIds: readonly string[]): Promise<StoredCourse[]> {
    const wanted = new Set(courseIds);
    return this.courses.filter((c) => wanted.has(c.id));
  }

  async create(course: NewCourse): Promise<StoredCourse> {
    const created: StoredCourse = {
      ...course,
      id: randomUUID(),
      // Created empty; the outline is authored afterwards.
      modules: [],
    };
    this.courses.push(created);
    return created;
  }

  async update(
    courseId: string,
    patch: CoursePatch,
  ): Promise<StoredCourse | null> {
    const course = this.courses.find((c) => c.id === courseId);
    if (!course) {
      return null;
    }
    // Field by field, because `{...course, ...patch}` would write `undefined`
    // over a value for every member the caller left out.
    if (patch.slug !== undefined) course.slug = patch.slug;
    if (patch.isPublished !== undefined) course.isPublished = patch.isPublished;
    if (patch.title !== undefined) course.title = patch.title;
    if (patch.description !== undefined) course.description = patch.description;
    if (patch.thumbnailUrl !== undefined)
      course.thumbnailUrl = patch.thumbnailUrl;
    if (patch.teacherName !== undefined) course.teacherName = patch.teacherName;
    if (patch.sequentialLockEnabled !== undefined)
      course.sequentialLockEnabled = patch.sequentialLockEnabled;
    // A copy: the caller must not hold a handle on the stored row, or an audit
    // `before` read a moment earlier would mutate underneath it.
    return { ...course };
  }
}
