import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { Role } from '../auth/roles.enum.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { EnrollmentRepository } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type {
  Announcement,
  AnnouncementRepository,
} from './interfaces/announcement-repository.interface.js';
import { ANNOUNCEMENT_REPOSITORY } from './interfaces/announcement-repository.interface.js';
import {
  parseAudience,
  type AnnouncementAudience,
} from './announcement-audience.js';

export interface AnnouncementContent {
  title: string;
  body: string;
}

/** Page size for the announcement lists. Bounded, so neither route drains the table. */
export const MAX_ANNOUNCEMENT_PAGE_SIZE = 100;
export const DEFAULT_ANNOUNCEMENT_PAGE_SIZE = 25;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(ANNOUNCEMENT_REPOSITORY)
    private readonly announcementRepo: AnnouncementRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    @Inject(ENROLLMENT_REPOSITORY)
    private readonly enrollmentRepo: EnrollmentRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * Post to one course.
   *
   * The TA's half of §2.2's preset, which grants "post course announcements"
   * explicitly - for courses they are assigned to and no others. The audience
   * is `course:<courseId>` taken from the URL, never from the body: there is no
   * field on `PostCourseAnnouncementDto` that could name a wider one, so a TA
   * cannot reach `all_students` through this route even by sending it.
   *
   * `assertAssigned` is the same check every other TA-reachable route makes,
   * and it 404s an unassigned course rather than 403ing it (§5.11) - there is
   * deliberately no second way of deciding this.
   */
  async postToCourse(
    courseId: string,
    actor: StaffActor,
    content: AnnouncementContent,
  ): Promise<Announcement> {
    await this.scope.assertAssigned(courseId, actor);
    return this.send({ type: 'course', courseId }, actor, content);
  }

  /**
   * Post to any audience. Teacher-only at the controller.
   *
   * `all_students` and `all_tas` are reachable from here and nowhere else,
   * which is what makes them admin-only (§2.2: a TA never sees or addresses
   * platform-wide data). A teacher may also target a single course through
   * this route - they are unscoped, so no assignment row is consulted.
   */
  async post(
    actor: StaffActor,
    rawAudience: string,
    content: AnnouncementContent,
  ): Promise<Announcement> {
    const audience = parseAudience(rawAudience);
    if (!audience) {
      // Unreachable through the DTO, which validates the same shape. Kept
      // because a message delivered to a half-understood audience is a message
      // delivered to the wrong people.
      throw new BadRequestException('Unrecognised audience');
    }
    return this.send(audience, actor, content);
  }

  /**
   * Resolve the audience, write the announcement, fan it out, and log it.
   *
   * The order matters. The announcement row is written *before* the fan-out so
   * that a crash mid-delivery leaves a record of what was sent rather than a
   * pile of notifications nothing accounts for. The audit entry comes last and
   * carries the recipient count, so §5.4's "which assistant did what" answers
   * with the size of the blast radius as well as the text.
   */
  private async send(
    audience: AnnouncementAudience,
    actor: StaffActor,
    content: AnnouncementContent,
  ): Promise<Announcement> {
    return this.db.runInTransaction(async () => {
      const recipientIds = await this.resolveRecipients(audience);

      const announcement = await this.announcementRepo.create({
        audienceType: audience.type,
        courseId: audience.courseId,
        title: content.title,
        body: content.body,
        postedBy: actor.id,
        recipientCount: recipientIds.length,
      });

      /**
       * Delivery is a notification per recipient (§5.14 resolved the audience
       * above; this is what makes it readable).
       *
       * Chosen over a "student fetches announcements for their courses" endpoint
       * because the platform already has a mailbox with an unread badge, a
       * read/unread state and a page - all of which an announcement needs and
       * none of which a new endpoint would have. The cost is one member on the
       * closed `NotificationType` union and one CHECK constraint in migration
       * 005.
       *
       * The body travels as the notification's message rather than as a link to
       * a detail page, because there is no announcement detail page - truncating
       * it would hide text with nowhere to go and read it. The link points at the
       * course home for a course announcement and is null platform-wide, where no
       * single page is the subject.
       */
      await this.notifications.fanOut(recipientIds, {
        type: 'announcement',
        title: content.title,
        message: content.body,
        link: audience.courseId ? `/learn/${audience.courseId}` : null,
      });

      await this.audit.record({
        actorId: actor.id,
        // The actor's role as it was (§5.4). A TA posting to their own course and
        // the teacher posting platform-wide must not read alike in the log.
        actorRole: actor.role === Role.Assistant ? Role.Assistant : Role.Teacher,
        action: 'announcement.posted',
        targetType: 'announcement',
        targetId: announcement.id,
        courseId: audience.courseId,
        before: null,
        after: {
          audience: announcement.audience,
          title: announcement.title,
          recipientCount: announcement.recipientCount,
        },
      });

      return announcement;
    });
  }

  /**
   * Who receives it, decided now (§5.14).
   *
   * Nothing here reads a stored list. `all_tas` comes from `role = 'assistant'`
   * at this instant, so an assistant hired after the announcement was drafted
   * is covered and one who left is not.
   */
  private async resolveRecipients(
    audience: AnnouncementAudience,
  ): Promise<string[]> {
    if (audience.type === 'all_tas') {
      return this.userRepo.findIdsByRole(Role.Assistant);
    }
    if (audience.type === 'all_students') {
      return this.userRepo.findIdsByRole(Role.Student);
    }

    const courseId = audience.courseId!;
    const course = await this.courseRepo.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    // The enrolled roll, not every student: a course announcement addressed to
    // the platform would be a different feature and a worse one.
    const enrollments = await this.enrollmentRepo.findByCourse(courseId);
    return enrollments.map((enrollment) => enrollment.studentId);
  }

  /** One course's announcements. TA-scoped through the same check as the write. */
  async listForCourse(
    courseId: string,
    actor: StaffActor,
    limit: number,
    offset: number,
  ): Promise<Announcement[]> {
    await this.scope.assertAssigned(courseId, actor);
    return this.announcementRepo.findByCourse(courseId, limit, offset);
  }

  /** Every announcement, whatever the audience. Admin-only; the controller enforces it. */
  async listAll(limit: number, offset: number): Promise<Announcement[]> {
    return this.announcementRepo.findAll(limit, offset);
  }

  /**
   * What a **student** sees on a course they hold (CLAUDE.md §5.18).
   *
   * Until 2026-09-10 an announcement reached a student only as a notification -
   * the body arrived in the mailbox and there was no page to click through to,
   * which is why `Notification.link` is null for one. This is that page's read.
   *
   * The gate is enrollment, not the staff scope check: a student holds the
   * course or they do not. Deliberately narrower than `listForCourse` in one
   * respect - it returns only `course:<id>` rows, and never the platform-wide
   * `all_students` ones. Those already reached this student's mailbox, and
   * folding them into a course page would put an announcement about the
   * platform under a heading about Chemistry.
   */
  async listForStudent(
    courseId: string,
    studentId: string,
    limit: number,
    offset: number,
  ): Promise<Announcement[]> {
    const enrollment = await this.enrollmentRepo.find(courseId, studentId);
    if (!enrollment) {
      // The same 404 an unenrolled student gets everywhere else, and for the
      // same reason: it must not distinguish a course that exists from one
      // that does not.
      throw new NotFoundException('Course not found or student not enrolled');
    }
    return this.announcementRepo.findByCourse(courseId, limit, offset);
  }
}
