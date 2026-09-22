import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { Role } from '../auth/roles.enum.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { PasswordHasher } from '../auth/interfaces/password-hasher.interface.js';
import { PASSWORD_HASHER } from '../auth/interfaces/password-hasher.interface.js';
import type {
  AdminStudentProfileUpdate,
  StudentRepository,
} from '../students/interfaces/student-repository.interface.js';
import { STUDENT_REPOSITORY } from '../students/interfaces/student-repository.interface.js';
import { MailService } from '../mail/mail.service.js';
import { resolveFrontendUrl, resolveNodeEnv } from '../common/config/env.js';
import type { StaffActor } from '../staff/staff-scope.service.js';

/** Byte-identical to `RegistrationApprovalService`'s, for the same reason. */
export const STUDENT_NOT_FOUND = 'Student not found';

/** A sign-in link is not urgent the way a self-requested reset is - a week to act on it. */
const SIGN_IN_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface StudentDetail {
  id: string;
  name: string;
  email: string;
  status: 'waiting' | 'active' | 'rejected';
  createdAt: string;
  enrolledCourseCount: number;
  phone: string | null;
  avatarUrl: string | null;
  schoolName: string | null;
  parentEmail: string | null;
  staffNotes: string | null;
}

/** The body of `POST /admin/students`. */
export interface CreateStudentInput {
  name: string;
  email: string;
}

async function toDetail(
  userRepo: UserRepository,
  studentRepo: StudentRepository,
  userId: string,
): Promise<StudentDetail | null> {
  const user = await userRepo.findById(userId);
  if (!user || user.role !== Role.Student) {
    return null;
  }
  const profile = await studentRepo.findByUserId(userId);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    status: user.status,
    createdAt: user.createdAt,
    enrolledCourseCount: profile?.enrolledCourseCount ?? 0,
    phone: profile?.phone ?? null,
    avatarUrl: profile?.avatarUrl ?? null,
    schoolName: profile?.schoolName ?? null,
    parentEmail: profile?.parentEmail ?? null,
    staffNotes: profile?.staffNotes ?? null,
  };
}

/**
 * The staff-facing student detail, edit and direct-create surface
 * (`PEOPLE-2`, `PEOPLE-3`). Reads and writes both the account row and the
 * profile row, which `DirectoryService`'s list-shaped reads deliberately
 * don't join (`CLAUDE.md` §7.1 - a detail screen may afford a second query
 * that a list of fifty rows may not).
 */
@Injectable()
export class AdminStudentsService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(STUDENT_REPOSITORY) private readonly studentRepo: StudentRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  async detail(userId: string): Promise<StudentDetail> {
    const detail = await toDetail(this.userRepo, this.studentRepo, userId);
    if (!detail) {
      throw new NotFoundException(STUDENT_NOT_FOUND);
    }
    return detail;
  }

  async update(
    userId: string,
    update: AdminStudentProfileUpdate,
    actor: StaffActor,
  ): Promise<StudentDetail> {
    return this.db.runInTransaction(async () => {
      const before = await toDetail(this.userRepo, this.studentRepo, userId);
      if (!before) {
        throw new NotFoundException(STUDENT_NOT_FOUND);
      }
      await this.studentRepo.updateByUserIdAsStaff(userId, update);
      const after = await toDetail(this.userRepo, this.studentRepo, userId);

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'student.updated',
        targetType: 'student',
        targetId: userId,
        courseId: null,
        // Flat scalars only (`CLAUDE.md` §9) - the fields that actually
        // changed, not the whole row either side.
        before: snapshotOf(before, update),
        after: snapshotOf(after!, update),
      });
      return after!;
    });
  }

  /**
   * Creates a student account directly, already `active`, and emails a
   * sign-in link - no self-registration queue involved (`PEOPLE-3`).
   *
   * The account gets a real password hash of a value nobody holds (the same
   * shape `login`'s dummy-hash comparison already relies on elsewhere in this
   * codebase), not a null or empty one - `users.password_hash` is `NOT NULL`,
   * and a guessable placeholder would be a live credential. The student sets
   * their real password by reusing the existing password-reset-token flow:
   * no new auth mechanism, the same token type `requestPasswordReset` already
   * issues, just minted here instead of from a self-service request.
   */
  async create(input: CreateStudentInput, actor: StaffActor): Promise<StudentDetail> {
    const existing = await this.userRepo.findByEmail(input.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    return this.db.runInTransaction(async () => {
      const placeholderHash = await this.hasher.hash(randomUUID());
      const user = await this.userRepo.create({
        email: input.email,
        passwordHash: placeholderHash,
        name: input.name,
        role: Role.Student,
        // Staff-created, not self-registered: skips the queue entirely.
        status: 'active',
      });
      await this.studentRepo.createForUser({
        userId: user.id,
        name: user.name,
        email: user.email,
      });

      const token = randomUUID();
      const expiresAt = new Date(Date.now() + SIGN_IN_LINK_TTL_MS).toISOString();
      await this.userRepo.createPasswordResetToken(user.id, token, expiresAt);
      const link = `${resolveFrontendUrl(resolveNodeEnv())}/reset-password?token=${token}`;
      await this.mail.send({
        to: user.email,
        template: 'sign-in-link',
        data: { link, expiresAt },
      });

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'student.created',
        targetType: 'student',
        targetId: user.id,
        courseId: null,
        before: null,
        after: { name: user.name, email: user.email },
      });

      const detail = await toDetail(this.userRepo, this.studentRepo, user.id);
      return detail!;
    });
  }
}

/** Only the fields the caller actually tried to change, on both sides. */
function snapshotOf(
  detail: StudentDetail,
  update: AdminStudentProfileUpdate,
): Record<string, string | number | boolean | null> {
  const snapshot: Record<string, string | number | boolean | null> = {};
  for (const key of Object.keys(update) as (keyof AdminStudentProfileUpdate)[]) {
    snapshot[key] = detail[key as keyof StudentDetail] as string | number | boolean | null;
  }
  return snapshot;
}
