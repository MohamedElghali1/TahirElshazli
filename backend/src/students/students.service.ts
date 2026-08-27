import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import type { StudentProfile, StudentRepository } from './interfaces/student-repository.interface.js';
import { STUDENT_REPOSITORY } from './interfaces/student-repository.interface.js';

@Injectable()
export class StudentsService {
  constructor(
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
  ) {}

  async getProfile(userId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }
    return profile;
  }
}
