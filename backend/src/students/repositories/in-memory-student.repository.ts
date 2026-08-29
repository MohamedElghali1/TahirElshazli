import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  StudentProfile,
  StudentProfileUpdate,
  StudentRepository,
} from '../interfaces/student-repository.interface.js';

@Injectable()
export class InMemoryStudentRepository implements StudentRepository {
  private profiles: StudentProfile[] = [
    {
      id: 'profile-1',
      userId: 'student-1',
      name: 'Ali Esam',
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

  async findByUserId(userId: string): Promise<StudentProfile | null> {
    return this.profiles.find((p) => p.userId === userId) ?? null;
  }

  async createForUser(user: {
    userId: string;
    name: string;
    email: string;
  }): Promise<StudentProfile> {
    const now = new Date().toISOString();
    const profile: StudentProfile = {
      id: randomUUID(),
      userId: user.userId,
      name: user.name,
      email: user.email,
      phone: null,
      avatarUrl: null,
      enrolledCourseCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.profiles.push(profile);
    return profile;
  }

  async updateByUserId(
    userId: string,
    update: StudentProfileUpdate,
  ): Promise<StudentProfile | null> {
    const profile = this.profiles.find((p) => p.userId === userId);
    if (!profile) {
      return null;
    }
    if (update.name !== undefined) {
      profile.name = update.name;
    }
    if (update.phone !== undefined) {
      profile.phone = update.phone;
    }
    if (update.avatarUrl !== undefined) {
      profile.avatarUrl = update.avatarUrl;
    }
    profile.updatedAt = new Date().toISOString();
    return profile;
  }
}
