import { Module } from '@nestjs/common';
import { StaffAnnouncementsController } from './staff-announcements.controller.js';
import { AdminAnnouncementsController } from './admin-announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';
import type { AnnouncementRepository } from './interfaces/announcement-repository.interface.js';
import { ANNOUNCEMENT_REPOSITORY } from './interfaces/announcement-repository.interface.js';
import { InMemoryAnnouncementRepository } from './repositories/in-memory-announcement.repository.js';
import { PostgresAnnouncementRepository } from './repositories/postgres-announcement.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { AuthModule } from '../auth/auth.module.js';
import { StaffModule } from '../staff/staff.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/**
 * Announcements: the "make announcements" half of the client's ask.
 *
 * It provides exactly one repository - its own. `COURSE_REPOSITORY`,
 * `ENROLLMENT_REPOSITORY`, `USER_REPOSITORY` and `NotificationsService` all
 * arrive from the modules that own them, because re-providing a token here
 * would build a *second* instance: under the in-memory driver the fan-out
 * would then write into an array no student's `/notifications` read looks at.
 *
 * `StaffModule` supplies `StaffScopeService`, which every course-scoped read
 * and write here goes through first (CLAUDE.md §5.11). `AuditService` arrives
 * via the global `AuditModule`.
 */
@Module({
  imports: [
    AuthModule,
    StaffModule,
    CoursesModule,
    EnrollmentsModule,
    NotificationsModule,
  ],
  controllers: [StaffAnnouncementsController, AdminAnnouncementsController],
  providers: [
    AnnouncementsService,
    InMemoryAnnouncementRepository,
    PostgresAnnouncementRepository,
    repositoryProvider<AnnouncementRepository>(ANNOUNCEMENT_REPOSITORY, InMemoryAnnouncementRepository, PostgresAnnouncementRepository),
  ],
})
export class AnnouncementsModule {}
