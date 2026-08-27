import { Injectable } from '@nestjs/common';
import type { StudentProfile, StudentRepository } from '../interfaces/student-repository.interface.js';

const STUB_PROFILES: StudentProfile[] = [
  {
    id: 'profile-1',
    userId: 'student-1',
    name: 'Ahmed Hassan',
    email: 'student@example.com',
    phone: '+201234567890',
    avatarUrl: null,
    enrolledCourseCount: 2,
    createdAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-08-01T12:00:00Z',
  },
  {
    id: 'profile-2',
    userId: 'student-2',
    name: 'Sara Ahmed',
    email: 'student2@example.com',
    phone: null,
    avatarUrl: null,
    enrolledCourseCount: 1,
    createdAt: '2026-03-10T08:00:00Z',
    updatedAt: '2026-07-20T14:00:00Z',
  },
];

@Injectable()
export class InMemoryStudentRepository implements StudentRepository {
  async findByUserId(userId: string): Promise<StudentProfile | null> {
    return STUB_PROFILES.find((p) => p.userId === userId) ?? null;
  }
}
