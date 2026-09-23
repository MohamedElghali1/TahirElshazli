import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { StaffScopeService, type StaffActor } from '../staff/staff-scope.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MailService } from '../mail/mail.service.js';
import { Role } from '../auth/roles.enum.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type { CourseRepository } from '../courses/interfaces/course-repository.interface.js';
import { COURSE_REPOSITORY } from '../courses/interfaces/course-repository.interface.js';
import type { EnrollmentRepository } from '../enrollments/interfaces/enrollment-repository.interface.js';
import { ENROLLMENT_REPOSITORY } from '../enrollments/interfaces/enrollment-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type { GroupRepository } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_REPOSITORY } from '../groups/interfaces/group-repository.interface.js';
import { GROUP_NOT_FOUND } from '../groups/groups.service.js';
import type {
  Announcement,
  AnnouncementRepository,
} from './interfaces/announcement-repository.interface.js';
import { ANNOUNCEMENT_REPOSITORY } from './interfaces/announcement-repository.interface.js';
import {
  parseAudience,
  type AnnouncementAudience,
} from './announcement-audience.js';
import { isUnscopedStaffRole } from '../auth/staff-roles.js';

export interface AnnouncementContent {
  title: string;
  body: string;
  mediaKind?: 'image' | 'video' | 'youtube' | 'file';
  mediaUrl?: string;
}

export const MAX_ANNOUNCEMENT_PAGE_SIZE = 100;
export const DEFAULT_ANNOUNCEMENT_PAGE_SIZE = 25;

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly scope: StaffScopeService,
    @Inject(ANNOUNCEMENT_REPOSITORY) private readonly announcementRepo: AnnouncementRepository,
    @Inject(COURSE_REPOSITORY) private readonly courseRepo: CourseRepository,
    @Inject(ENROLLMENT_REPOSITORY) private readonly enrollmentRepo: EnrollmentRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    @Inject(GROUP_REPOSITORY) private readonly groupRepo: GroupRepository,
    private readonly notifications: NotificationsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly db: DatabaseService,
  ) {}

  async createDraft(
    audience: AnnouncementAudience,
    actor: StaffActor,
    content: AnnouncementContent,
  ): Promise<Announcement> {
    return this.db.runInTransaction(async () => {
      const announcement = await this.announcementRepo.create({
        audienceType: audience.type,
        courseId: audience.courseId,
        groupId: audience.groupId,
        title: content.title,
        body: content.body,
        mediaKind: content.mediaKind ?? null,
        mediaUrl: content.mediaUrl ?? null,
        postedBy: actor.id,
        recipientCount: 0,
      });

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'announcement.created',
        targetType: 'announcement',
        targetId: announcement.id,
        courseId: audience.courseId,
        before: null,
        after: {
          audience: announcement.audience,
          title: announcement.title,
        },
      });

      return announcement;
    });
  }

  async postToCourse(courseId: string, actor: StaffActor, content: AnnouncementContent): Promise<Announcement> {
    await this.scope.assertAssigned(courseId, actor);
    return this.createDraft({ type: 'course', courseId, groupId: null }, actor, content);
  }

  async postToGroup(groupId: string, actor: StaffActor, content: AnnouncementContent): Promise<Announcement> {
    const canReach = await this.scope.mayReachGroup(groupId, actor);
    if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
    return this.createDraft({ type: 'group', courseId: null, groupId }, actor, content);
  }

  async post(actor: StaffActor, rawAudience: string, content: AnnouncementContent): Promise<Announcement> {
    const audience = parseAudience(rawAudience);
    if (!audience) throw new BadRequestException('Unrecognised audience');
    return this.createDraft(audience, actor, content);
  }

  async updateDraft(id: string, actor: StaffActor, patch: Partial<AnnouncementContent> & { audience?: string }): Promise<Announcement> {
    return this.db.runInTransaction(async () => {
      const existing = await this.announcementRepo.findById(id);
      if (!existing) throw new NotFoundException('Announcement not found');

      if (existing.courseId) await this.scope.assertAssigned(existing.courseId, actor);
      if (existing.groupId) {
        const canReach = await this.scope.mayReachGroup(existing.groupId, actor);
        if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
      }

      if (existing.publishedAt && patch.audience !== undefined) {
        throw new ConflictException('Cannot change audience of a published announcement');
      }

      const updates: Parameters<AnnouncementRepository['update']>[1] = {
        title: patch.title,
        body: patch.body,
        mediaKind: patch.mediaKind === undefined ? undefined : (patch.mediaKind ?? null),
        mediaUrl: patch.mediaUrl === undefined ? undefined : (patch.mediaUrl ?? null),
      };

      if (patch.audience !== undefined && !existing.publishedAt) {
        const parsed = parseAudience(patch.audience);
        if (!parsed) throw new BadRequestException('Unrecognised audience');
        if (parsed.courseId) await this.scope.assertAssigned(parsed.courseId, actor);
        if (parsed.groupId) {
          const canReach = await this.scope.mayReachGroup(parsed.groupId, actor);
          if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
        }
        updates.audienceType = parsed.type;
        updates.courseId = parsed.courseId;
        updates.groupId = parsed.groupId;
      }

      const updated = await this.announcementRepo.update(id, updates);
      if (!updated) throw new NotFoundException('Announcement not found');

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'announcement.updated',
        targetType: 'announcement',
        targetId: updated.id,
        courseId: updated.courseId,
        before: { title: existing.title, audience: existing.audience },
        after: { title: updated.title, audience: updated.audience },
      });

      return updated;
    });
  }

  async deleteDraft(id: string, actor: StaffActor): Promise<void> {
    return this.db.runInTransaction(async () => {
      const existing = await this.announcementRepo.findById(id);
      if (!existing) throw new NotFoundException('Announcement not found');

      if (existing.courseId) await this.scope.assertAssigned(existing.courseId, actor);
      if (existing.groupId) {
        const canReach = await this.scope.mayReachGroup(existing.groupId, actor);
        if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
      }

      if (existing.publishedAt) throw new ConflictException('Cannot delete a published announcement');

      const removed = await this.announcementRepo.remove(id);
      if (!removed) throw new ConflictException('Failed to remove announcement');

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'announcement.deleted',
        targetType: 'announcement',
        targetId: id,
        courseId: existing.courseId,
        before: { title: existing.title, audience: existing.audience },
        after: null,
      });
    });
  }

  async publish(id: string, actor: StaffActor): Promise<Announcement> {
    return this.db.runInTransaction(async () => {
      const announcement = await this.announcementRepo.findById(id);
      if (!announcement) throw new NotFoundException('Announcement not found');

      if (!isUnscopedStaffRole(actorRoleOf(actor))) {
        throw new ForbiddenException('Only teachers and admins can publish announcements');
      }

      if (announcement.courseId) await this.scope.assertAssigned(announcement.courseId, actor);
      if (announcement.groupId) {
        const canReach = await this.scope.mayReachGroup(announcement.groupId, actor);
        if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
      }

      const audience: AnnouncementAudience = {
        type: announcement.audienceType,
        courseId: announcement.courseId,
        groupId: announcement.groupId,
      };

      const recipientIds = await this.resolveRecipients(audience);
      const published = await this.announcementRepo.publish(id, recipientIds.length);
      
      if (!published) throw new ConflictException('Announcement already published');

      await this.notifications.fanOut(recipientIds, {
        type: 'announcement',
        title: published.title,
        message: published.body,
        link: audience.courseId ? `/learn/${audience.courseId}` : null,
      });

      const users = await this.userRepo.findByIds(recipientIds);
      for (const user of users) {
        if (user.email) {
          await this.mail.send({
            to: user.email,
            template: 'announcement',
            data: { title: published.title, body: published.body },
          });
        }
      }

      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'announcement.posted',
        targetType: 'announcement',
        targetId: published.id,
        courseId: published.courseId,
        before: null,
        after: {
          audience: published.audience,
          title: published.title,
          recipientCount: published.recipientCount,
        },
      });

      return published;
    });
  }

  private async resolveRecipients(audience: AnnouncementAudience): Promise<string[]> {
    if (audience.type === 'all_tas') return this.userRepo.findIdsByRole([Role.Assistant, Role.Admin]);
    if (audience.type === 'all_students') return this.userRepo.findIdsByRole([Role.Student]);

    if (audience.type === 'group') {
      const members = await this.groupRepo.findMembers(audience.groupId!);
      return members.map(m => m.studentId);
    }

    const courseId = audience.courseId!;
    const course = await this.courseRepo.findById(courseId);
    if (!course) throw new NotFoundException('Course not found');
    const enrollments = await this.enrollmentRepo.findByCourse(courseId);
    return enrollments.map(e => e.studentId);
  }

  async previewReach(rawAudience: string, actor: StaffActor): Promise<{ reach: number }> {
    const audience = parseAudience(rawAudience);
    if (!audience) throw new BadRequestException('Unrecognised audience');

    if (!isUnscopedStaffRole(actorRoleOf(actor))) {
      if (audience.type === 'all_students' || audience.type === 'all_tas') {
        throw new ForbiddenException('Cannot preview reach for platform-wide audiences');
      }
    }

    if (audience.type === 'course') {
      await this.scope.assertAssigned(audience.courseId!, actor);
    }
    if (audience.type === 'group') {
      const canReach = await this.scope.mayReachGroup(audience.groupId!, actor);
      if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
    }

    const recipientIds = await this.resolveRecipients(audience);
    return { reach: recipientIds.length };
  }

  async listForCourse(courseId: string, actor: StaffActor, limit: number, offset: number, status?: 'draft' | 'published'): Promise<Announcement[]> {
    await this.scope.assertAssigned(courseId, actor);
    return this.announcementRepo.findByCourse(courseId, limit, offset, status);
  }

  async listForGroup(groupId: string, actor: StaffActor, limit: number, offset: number, status?: 'draft' | 'published'): Promise<Announcement[]> {
    const canReach = await this.scope.mayReachGroup(groupId, actor);
    if (!canReach) throw new NotFoundException(GROUP_NOT_FOUND);
    return this.announcementRepo.findByGroup(groupId, limit, offset, status);
  }

  async listAll(limit: number, offset: number, status?: 'draft' | 'published'): Promise<Announcement[]> {
    return this.announcementRepo.findAll(limit, offset, status);
  }

  async listForStudent(courseId: string, studentId: string, limit: number, offset: number): Promise<Announcement[]> {
    const enrollment = await this.enrollmentRepo.find(courseId, studentId);
    if (!enrollment) throw new NotFoundException('Course not found or student not enrolled');
    return this.announcementRepo.findByCourse(courseId, limit, offset, 'published');
  }
}
