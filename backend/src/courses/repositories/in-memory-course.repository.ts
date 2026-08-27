import { Injectable } from '@nestjs/common';
import type {
  CourseRepository,
  CourseListItem,
  CourseDetail,
  CourseModule,
  RecordedProgress,
  LiveProgress,
} from '../interfaces/course-repository.interface.js';

const STUB_MODULES: CourseModule[] = [
  {
    id: 'mod-1',
    title: 'Introduction to IGCSE Chemistry',
    order: 1,
    lessons: [
      { id: 'lesson-1', title: 'Atomic Structure', order: 1, durationSeconds: 2400 },
      { id: 'lesson-2', title: 'The Periodic Table', order: 2, durationSeconds: 1800 },
    ],
  },
  {
    id: 'mod-2',
    title: 'Chemical Bonding',
    order: 2,
    lessons: [
      { id: 'lesson-3', title: 'Ionic Bonding', order: 1, durationSeconds: 3000 },
      { id: 'lesson-4', title: 'Covalent Bonding', order: 2, durationSeconds: 2700 },
    ],
  },
];

const STUB_RECORDED_PROGRESS: RecordedProgress = {
  type: 'recorded',
  completedLessons: 2,
  totalLessons: 4,
  completionPercentage: 50,
  checkpoints: [
    { lessonId: 'lesson-1', completedAt: '2026-07-01T10:00:00Z' },
    { lessonId: 'lesson-2', completedAt: '2026-07-03T14:00:00Z' },
    { lessonId: 'lesson-3', completedAt: null },
    { lessonId: 'lesson-4', completedAt: null },
  ],
};

const STUB_LIVE_PROGRESS: LiveProgress = {
  type: 'live',
  attendedSessions: 3,
  totalSessions: 5,
  attendancePercentage: 60,
  timeline: [
    { sessionId: 'sess-1', sessionDate: '2026-07-05T16:00:00Z', attended: true },
    { sessionId: 'sess-2', sessionDate: '2026-07-12T16:00:00Z', attended: true },
    { sessionId: 'sess-3', sessionDate: '2026-07-19T16:00:00Z', attended: false },
    { sessionId: 'sess-4', sessionDate: '2026-07-26T16:00:00Z', attended: true },
    { sessionId: 'sess-5', sessionDate: '2026-08-02T16:00:00Z', attended: false },
  ],
};

interface InternalCourse {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  learningMode: 'recorded' | 'live';
  sequentialLockEnabled: boolean;
  modules: CourseModule[];
  enrolledStudents: string[];
}

const STUB_COURSES: InternalCourse[] = [
  {
    id: 'course-1',
    title: 'IGCSE Chemistry',
    description: 'Complete IGCSE Chemistry course with Dr. Tahir',
    thumbnailUrl: null,
    learningMode: 'recorded',
    sequentialLockEnabled: true,
    modules: STUB_MODULES,
    enrolledStudents: ['student-1', 'student-2'],
  },
  {
    id: 'course-2',
    title: 'IELTS Preparation - Live',
    description: 'Live IELTS preparation course',
    thumbnailUrl: null,
    learningMode: 'live',
    sequentialLockEnabled: false,
    modules: [
      {
        id: 'mod-3',
        title: 'Speaking Skills',
        order: 1,
        lessons: [
          { id: 'lesson-5', title: 'Introduction to IELTS Speaking', order: 1, durationSeconds: 3600 },
        ],
      },
    ],
    enrolledStudents: ['student-1'],
  },
];

@Injectable()
export class InMemoryCourseRepository implements CourseRepository {
  async findEnrolledCourses(studentId: string): Promise<CourseListItem[]> {
    return STUB_COURSES.filter((c) => c.enrolledStudents.includes(studentId)).map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      thumbnailUrl: c.thumbnailUrl,
      learningMode: c.learningMode,
      progress: c.learningMode === 'recorded' ? STUB_RECORDED_PROGRESS : STUB_LIVE_PROGRESS,
    }));
  }

  async findCourseDetail(
    courseId: string,
    studentId: string,
  ): Promise<CourseDetail | null> {
    const course = STUB_COURSES.find(
      (c) => c.id === courseId && c.enrolledStudents.includes(studentId),
    );
    if (!course) return null;
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      thumbnailUrl: course.thumbnailUrl,
      learningMode: course.learningMode,
      sequentialLockEnabled: course.sequentialLockEnabled,
      modules: course.modules,
      progress: course.learningMode === 'recorded' ? STUB_RECORDED_PROGRESS : STUB_LIVE_PROGRESS,
    };
  }
}
