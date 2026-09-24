import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  AnnouncementsService,
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
} from './announcements.service.js';
import type { Announcement } from './interfaces/announcement-repository.interface.js';
import {
  ListAnnouncementsQueryDto,
  PostCourseAnnouncementDto,
  PatchAnnouncementDraftDto,
} from './dto/post-announcement.dto.js';

@Controller('staff')
@Roles(...STAFF_ALL)
export class StaffAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Get('announcements/reach')
  async previewReach(
    @Query('audience') audience: string,
    @Request() req: { user: JwtPayload },
  ): Promise<{ reach: number }> {
    return this.announcements.previewReach(audience, this.actor(req));
  }

  @Get('courses/:courseId/announcements')
  async listForCourse(
    @Param('courseId') courseId: string,
    @Query() query: ListAnnouncementsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement[]> {
    return this.announcements.listForCourse(
      courseId,
      this.actor(req),
      query.limit ?? DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
      query.offset ?? 0,
      query.status,
    );
  }

  @Post('courses/:courseId/announcements')
  @HttpCode(HttpStatus.CREATED)
  async createCourseDraft(
    @Param('courseId') courseId: string,
    @Body() body: PostCourseAnnouncementDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.postToCourse(courseId, this.actor(req), {
      title: body.title,
      body: body.body,
      mediaKind: body.mediaKind,
      mediaUrl: body.mediaUrl,
    });
  }

  @Patch('courses/:courseId/announcements/:id')
  async updateCourseDraft(
    @Param('id') id: string,
    @Body() body: PatchAnnouncementDraftDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.updateDraft(id, this.actor(req), body);
  }

  @Delete('courses/:courseId/announcements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCourseDraft(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.announcements.deleteDraft(id, this.actor(req));
  }



  @Get('groups/:groupId/announcements')
  async listForGroup(
    @Param('groupId') groupId: string,
    @Query() query: ListAnnouncementsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement[]> {
    return this.announcements.listForGroup(
      groupId,
      this.actor(req),
      query.limit ?? DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
      query.offset ?? 0,
      query.status,
    );
  }

  @Post('groups/:groupId/announcements')
  @HttpCode(HttpStatus.CREATED)
  async createGroupDraft(
    @Param('groupId') groupId: string,
    @Body() body: PostCourseAnnouncementDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.postToGroup(groupId, this.actor(req), {
      title: body.title,
      body: body.body,
      mediaKind: body.mediaKind,
      mediaUrl: body.mediaUrl,
    });
  }

  @Patch('groups/:groupId/announcements/:id')
  async updateGroupDraft(
    @Param('id') id: string,
    @Body() body: PatchAnnouncementDraftDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.updateDraft(id, this.actor(req), body);
  }

  @Delete('groups/:groupId/announcements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGroupDraft(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.announcements.deleteDraft(id, this.actor(req));
  }

}
