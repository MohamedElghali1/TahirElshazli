import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type {
  StudentProfile,
  StudentProfileUpdate,
  StudentRepository,
} from './interfaces/student-repository.interface.js';
import { STUDENT_REPOSITORY } from './interfaces/student-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { PasswordHasher } from '../auth/interfaces/password-hasher.interface.js';
import { PASSWORD_HASHER } from '../auth/interfaces/password-hasher.interface.js';
import { TokenDenylistService } from '../auth/token-denylist.service.js';

/**
 * The student's own profile, as the student may see it.
 *
 * Built key by key from `StudentProfile` rather than spread from it, and the
 * three staff fields (`schoolName`, `parentEmail`, `staffNotes`) are the
 * reason. `parentEmail` is a third party's PII on a child's record and
 * `staffNotes` is staff writing about the student; `DOMAIN_MODEL.md:35` says
 * neither is student-facing. A spread would carry the next staff field added
 * to the table straight onto this response without anyone noticing, which is
 * exactly the failure mode - so the allowed keys are listed, and
 * `students.controller.spec.ts` asserts the exact key set.
 */
export interface StudentProfileView {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  enrolledCourseCount: number;
  createdAt: string;
  updatedAt: string;
}

function toStudentView(profile: StudentProfile): StudentProfileView {
  return {
    id: profile.id,
    userId: profile.userId,
    name: profile.name,
    email: profile.email,
    phone: profile.phone,
    avatarUrl: profile.avatarUrl,
    enrolledCourseCount: profile.enrolledCourseCount,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

@Injectable()
export class StudentsService {
  constructor(
    @Inject(STUDENT_REPOSITORY)
    private readonly studentRepo: StudentRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: UserRepository,
    @Inject(PASSWORD_HASHER)
    private readonly hasher: PasswordHasher,
    private readonly denylist: TokenDenylistService,
  ) {}

  async getProfile(userId: string): Promise<StudentProfileView> {
    const profile = await this.studentRepo.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }
    return toStudentView(profile);
  }

  async updateProfile(
    userId: string,
    update: StudentProfileUpdate,
  ): Promise<StudentProfileView> {
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No profile fields supplied');
    }
    const profile = await this.studentRepo.updateByUserId(userId, update);
    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }
    return toStudentView(profile);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ success: true }> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const matches = await this.hasher.verify(currentPassword, user.passwordHash);
    if (!matches) {
      throw new UnauthorizedException('Current password is incorrect');
    }
    if (currentPassword === newPassword) {
      throw new BadRequestException(
        'New password must be different from the current password',
      );
    }
    await this.userRepo.updatePassword(userId, await this.hasher.hash(newPassword));
    // Every session predating the change dies with the old password, including
    // any an attacker is holding - which is usually why a password gets changed.
    this.denylist.revokeAllForUser(userId);
    return { success: true };
  }
}
