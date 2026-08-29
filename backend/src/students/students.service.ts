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

  async getProfile(userId: string): Promise<StudentProfile> {
    const profile = await this.studentRepo.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }
    return profile;
  }

  async updateProfile(
    userId: string,
    update: StudentProfileUpdate,
  ): Promise<StudentProfile> {
    if (Object.keys(update).length === 0) {
      throw new BadRequestException('No profile fields supplied');
    }
    const profile = await this.studentRepo.updateByUserId(userId, update);
    if (!profile) {
      throw new NotFoundException('Student profile not found');
    }
    return profile;
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
