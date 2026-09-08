import { Inject, Injectable } from '@nestjs/common';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { EnrollmentRepository } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { Role } from '../auth/roles.enum.js';

export interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface StudentDirectoryEntry extends DirectoryEntry {
  enrolledCourseCount: number;
}

export const MAX_DIRECTORY_PAGE_SIZE = 100;
export const DEFAULT_DIRECTORY_PAGE_SIZE = 50;

/**
 * The admin-only people lists (CLAUDE.md §2.2: the full student directory is
 * admin, never TA). No scoping here on purpose - these queries never join
 * through `CourseStaffAssignment`, and that asymmetry is the design (§5.11).
 * The controller's `@Roles(Role.Teacher)` is what keeps a TA out.
 *
 * No password hash reaches these shapes. `StoredUser` carries one and it must
 * not travel further than the auth service.
 */
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepo: EnrollmentRepository,
  ) {}

  async students(options: {
    search?: string;
    limit: number;
    offset: number;
  }): Promise<StudentDirectoryEntry[]> {
    const users = await this.userRepo.findByRole(Role.Student, options);
    // One batch count for the page, rather than `findByStudent` per row - the
    // N+1 CLAUDE.md §7.1 asks new code not to add.
    const counts = await this.enrollmentRepo.countByStudents(users.map((u) => u.id));
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      enrolledCourseCount: counts[user.id] ?? 0,
    }));
  }

  /** The picker behind "assign a TA to this course". */
  async assistants(options: {
    search?: string;
    limit: number;
    offset: number;
  }): Promise<DirectoryEntry[]> {
    const users = await this.userRepo.findByRole(Role.Assistant, options);
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    }));
  }
}
