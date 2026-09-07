import { Injectable } from '@nestjs/common';
import type {
  CourseRepository,
  StoredCourse,
} from '../interfaces/course-repository.interface.js';

const STUB_COURSES: StoredCourse[] = [
  {
    id: 'course-1',
    title: 'AS Chemistry',
    description: 'Complete AS-level Chemistry course with Dr. Tahir',
    thumbnailUrl: null,
    teacherName: 'Dr. Tahir Elshazli',
    sequentialLockEnabled: true,
    defaultLearningMode: 'recorded',
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
    title: 'IELTS Preparation - Live',
    description: 'Live IELTS preparation course',
    thumbnailUrl: null,
    teacherName: 'Dr. Tahir Elshazli',
    sequentialLockEnabled: false,
    defaultLearningMode: 'live',
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
  async findById(courseId: string): Promise<StoredCourse | null> {
    return STUB_COURSES.find((c) => c.id === courseId) ?? null;
  }

  async findAll(limit: number, offset: number): Promise<StoredCourse[]> {
    return [...STUB_COURSES]
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(offset, offset + limit);
  }

  async findByIds(courseIds: readonly string[]): Promise<StoredCourse[]> {
    const wanted = new Set(courseIds);
    return STUB_COURSES.filter((c) => wanted.has(c.id));
  }
}
