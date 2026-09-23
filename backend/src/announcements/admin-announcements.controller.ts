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
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  AnnouncementsService,
  DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
} from './announcements.service.js';
import type { Announcement } from './interfaces/announcement-repository.interface.js';
import {
  ListAnnouncementsQueryDto,
  PostAnnouncementDto,
  PatchAdminAnnouncementDraftDto,
} from './dto/post-announcement.dto.js';

@Controller('admin')
@Roles(...STAFF_ADMIN)
export class AdminAnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Get('announcements')
  async list(
    @Query() query: ListAnnouncementsQueryDto,
  ): Promise<Announcement[]> {
    return this.announcements.listAll(
      query.limit ?? DEFAULT_ANNOUNCEMENT_PAGE_SIZE,
      query.offset ?? 0,
      query.status,
    );
  }

  @Post('announcements')
  @HttpCode(HttpStatus.CREATED)
  async createDraft(
    @Body() body: PostAnnouncementDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.post(this.actor(req), body.audience, {
      title: body.title,
      body: body.body,
      mediaKind: body.mediaKind,
      mediaUrl: body.mediaUrl,
    });
  }

  @Patch('announcements/:id')
  async updateDraft(
    @Param('id') id: string,
    @Body() body: PatchAdminAnnouncementDraftDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.updateDraft(id, this.actor(req), body);
  }

  @Delete('announcements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDraft(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.announcements.deleteDraft(id, this.actor(req));
  }

  @Post('announcements/:id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<Announcement> {
    return this.announcements.publish(id, this.actor(req));
  }
}
