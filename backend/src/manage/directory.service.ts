import { Inject, Injectable } from '@nestjs/common';
import type {
  UserRepository,
  UserStatus,
} from '../auth/interfaces/user-repository.interface.js';
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

/**
 * `status` is emitted because this list is the **only** place a waiting
 * registration is visible (`DOM-4`). Without it the queue screen cannot tell a
 * student who is studying from one who is waiting for a decision, and the
 * accept/reject routes would have nothing to list.
 *
 * The four percentage fields `API_SPEC.yaml`'s `StudentDetail` carries are
 * still absent: they have no source until the reports and analytics units, and
 * emitting a shape the server cannot fill is drift (`CLAUDE.md` §6).
 */
export interface StudentDirectoryEntry extends DirectoryEntry {
  enrolledCourseCount: number;
  status: UserStatus;
}

export const MAX_DIRECTORY_PAGE_SIZE = 100;
export const DEFAULT_DIRECTORY_PAGE_SIZE = 50;

/**
 * The admin-only people lists (CLAUDE.md §2.2: the full student directory is
 * admin, never TA). No scoping here on purpose - these queries never join
 * through `CourseStaffAssignment`, and that asymmetry is the design (§5.11).
 * The controller's `@Roles(...STAFF_ADMIN)` is what keeps a TA out.
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

  /**
   * `status` is optional and its absence means **every** status, not `active` -
   * this is the admin's whole student list, and a filter that quietly hid the
   * waiting accounts would hide the queue from the one person who can clear it.
   */
  async students(options: {
    search?: string;
    status?: UserStatus;
    limit: number;
    offset: number;
  }): Promise<StudentDirectoryEntry[]> {
    const users = await this.userRepo.findByRole([Role.Student], options);
    // One batch count for the page, rather than `findByStudent` per row - the
    // N+1 CLAUDE.md §7.1 asks new code not to add.
    const counts = await this.enrollmentRepo.countByStudents(users.map((u) => u.id));
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      enrolledCourseCount: counts[user.id] ?? 0,
      status: user.status,
    }));
  }

  /**
   * One directory row by id. The accept route's response: the row the queue
   * screen was showing, as it now is.
   *
   * Here rather than in `RegistrationApprovalService` because this service owns
   * the row shape - building it a second time over there is how the two drift.
   */
  async student(userId: string): Promise<StudentDirectoryEntry | null> {
    const user = await this.userRepo.findById(userId);
    if (!user || user.role !== Role.Student) {
      return null;
    }
    const counts = await this.enrollmentRepo.countByStudents([user.id]);
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      enrolledCourseCount: counts[user.id] ?? 0,
      status: user.status,
    };
  }
}
