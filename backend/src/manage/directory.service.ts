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

/**
 * A staff directory row. `role` is emitted because this list now holds two
 * tiers - assistants and the Full admin - and `API_SPEC.yaml:210-221` requires
 * it (`Assistant.role` is `[assistant, admin]`). Without it the console cannot
 * tell them apart, which matters: the course-staff picker must not offer to
 * assign an admin, who is unscoped by definition and whom
 * `StaffService.assign` refuses.
 *
 * `scope`, `groupIds`, `status` and `lastSeenAt` are deliberately absent -
 * those are `PEOPLE-4`, and `lastSeenAt` has no source anywhere in the
 * repository today (unit-1 ruling 4). `status` here would be the *account*
 * status added by `DOM-4`, which for staff is always `active` and would read
 * as the scope field this row does not yet carry.
 */
export interface StaffDirectoryEntry extends DirectoryEntry {
  role: Role;
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

  /**
   * The staff list, and the picker behind "assign a TA to this course".
   *
   * Includes the Full admin as well as the assistants, because this is the only
   * staff directory the product has: an `admin` account that appeared in no
   * list would be a person with the teacher's access whom nobody can see
   * (AUTH-1, `API_SPEC.yaml:217`). The caller reads `role` to decide what to
   * offer - `StaffService.assign` refuses a non-assistant, so an admin row is a
   * row to display, not one to offer assignment on.
   */
  async assistants(options: {
    search?: string;
    limit: number;
    offset: number;
  }): Promise<StaffDirectoryEntry[]> {
    const users = await this.userRepo.findByRole(
      [Role.Assistant, Role.Admin],
      options,
    );
    return users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
    }));
  }
}
