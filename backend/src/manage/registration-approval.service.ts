import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import { assertMay } from '../auth/capabilities.js';
import { Role } from '../auth/roles.enum.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { CoursesService } from '../courses/courses.service.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import {
  DirectoryService,
  type StudentDirectoryEntry,
} from './directory.service.js';

/**
 * One message for "there is no such waiting student", used by both routes and
 * by every reason a student cannot be reached - unknown id, a staff account,
 * a soft-deleted row.
 *
 * Exported so the specs can assert the out-of-scope and genuine-miss paths are
 * byte-identical rather than merely both 404 (`CLAUDE.md` §7).
 */
export const STUDENT_NOT_FOUND = 'Student not found';

/** One message for "this registration has already been decided". Names no id. */
export const ALREADY_DECIDED = 'That registration has already been decided';

/**
 * The registration queue (`DOM-4`): the two staff decisions that let a person
 * into the platform, or keep them out.
 *
 * **Accept is one transaction, and that is the whole design of this file.**
 * Activating the account, enrolling it and placing it in a cohort are three
 * writes describing one decision; committing the first without the rest leaves
 * a student who is `active`, in a group, and enrolled on nothing - every course
 * read 404s and there is nothing on any screen that says why. `runInTransaction`
 * makes them one commit, and the audit entry rides inside it (`CLAUDE.md` §9).
 *
 * It lives in `ManageModule` rather than in a module of its own:
 * `/admin/students` is already here beside `DirectoryService`, `CoursesModule`
 * is already imported, and `GROUP_REPOSITORY` is global - so there is no new
 * import edge to justify a fourth thing to wire.
 */
@Injectable()
export class RegistrationApprovalService {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    private readonly coursesService: CoursesService,
    private readonly directory: DirectoryService,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * The waiting account, or a 404 that says nothing more.
   *
   * A non-student account is refused with the **same** message as a missing
   * one: an admin id typed into this route is not a registration, and saying
   * so would confirm which ids name staff.
   */
  private async requireWaitingStudent(studentId: string) {
    const student = await this.userRepo.findById(studentId);
    if (!student || student.role !== Role.Student) {
      throw new NotFoundException(STUDENT_NOT_FOUND);
    }
    if (student.status !== 'waiting') {
      // 409, and it names no id - the caller already holds this one, and the
      // message is the same whether the account was accepted or rejected.
      throw new ConflictException(ALREADY_DECIDED);
    }
    return student;
  }

  /**
   * Accept: activate, enrol on the group's course, place in the group.
   *
   * The group decides the course. There is no separate `courseId` parameter
   * because a group studies exactly one course (migration 013), and letting a
   * caller name both would allow a student to be placed in one cohort and
   * enrolled on another.
   */
  async accept(
    studentId: string,
    groupId: string,
    actor: StaffActor,
  ): Promise<StudentDirectoryEntry> {
    return this.db.runInTransaction(async () => {
      const student = await this.requireWaitingStudent(studentId);
      // A fresh literal, not a reference into `student`: a `before` that
      // aliases its `after` records a change that appears never to have
      // happened (`CLAUDE.md` §9).
      const before = { status: student.status };

      const group = await this.groupRepo.findById(groupId);
      if (!group) {
        throw new NotFoundException('Group not found');
      }

      await this.userRepo.setStatus(studentId, 'active');
      // `CoursesService.enroll` rather than the enrollment repository: it is
      // the method that owns "may this course be enrolled on at all" (it
      // refuses an unpublished one), and `PRODUCT_SPEC.md:47` retires only the
      // student's self-enrol *route*, never this.
      await this.coursesService.enroll(group.courseId, studentId);
      await this.groupRepo.addMember({
        groupId,
        studentId,
        assignedBy: actor.id,
      });

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'student.accepted',
        targetType: 'student',
        targetId: studentId,
        // There *is* a course here, unlike a placement: accepting enrols them
        // on it, so "everything that happened in course-1" should include it.
        courseId: group.courseId,
        before,
        after: { status: 'active', groupId, courseId: group.courseId },
      });

      const entry = await this.directory.student(studentId);
      // The row was read inside this transaction, moments after it was
      // written. A null here would mean the driver contract changed.
      return entry!;
    });
  }

  /**
   * Reject: the account stays, refused.
   *
   * The row is **not** deleted. Deleting it would free the address to register
   * again into a clean slate, and would leave the audit entry naming a row
   * that no longer exists - which is the entry being half of a record.
   *
   * `assertMay` is the **first** statement, outside the transaction and before
   * anything is read, so a refused assistant learns nothing about whether the
   * student exists. It is one of the four verbs withheld from an assistant
   * (`AUTHORIZATION_MODEL.md` §3); the controller's `@Roles` is the outer
   * gate, this is the rule (`CLAUDE.md` §7).
   */
  async reject(
    studentId: string,
    reason: string | undefined,
    actor: StaffActor,
  ): Promise<{ ok: true }> {
    assertMay(actor, 'registration.reject');
    return this.db.runInTransaction(async () => {
      const student = await this.requireWaitingStudent(studentId);
      const before = { status: student.status };

      await this.userRepo.setStatus(studentId, 'rejected');
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'student.rejected',
        targetType: 'student',
        targetId: studentId,
        // No course: a rejected registration was never enrolled on one.
        courseId: null,
        before,
        // `reason` is staff's own words about their own decision, and this
        // entry is the only place it is durable - a validated field that was
        // then dropped would be drift. Nothing about the student's record goes
        // in here: never `parentEmail`, never a note, never the email address.
        after: { status: 'rejected', reason: reason ?? null },
      });
      return { ok: true } as const;
    });
  }
}
