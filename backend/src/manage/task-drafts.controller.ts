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
import type { StoredTaskDraft } from './interfaces/task-draft-repository.interface.js';
import { TaskDraftsService } from './task-drafts.service.js';
import {
  CreateTaskDraftDto,
  ListTaskDraftsQueryDto,
  UpdateTaskDraftDto,
} from './dto/task-draft.dto.js';

/**
 * `/staff/task-drafts` - the draft library (`TASK-2`).
 *
 * Teacher, admin and assistant (`AUTHORIZATION_MODEL.md` §3: "Manage the draft
 * library ✓", no own-only rule). Nothing here decides access: every handler
 * passes the actor to `TaskDraftsService`, which goes through
 * `StaffScopeService` before anything is read or written.
 */
@Controller('staff')
@Roles(...STAFF_ALL)
export class TaskDraftsController {
  constructor(private readonly drafts: TaskDraftsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Get('task-drafts')
  async list(
    @Query() query: ListTaskDraftsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StoredTaskDraft[]> {
    return this.drafts.list(this.actor(req), {
      courseId: query.courseId,
      type: query.type,
    });
  }

  @Post('task-drafts')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateTaskDraftDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StoredTaskDraft> {
    // Field by field, so a field the DTO does not declare cannot ride through.
    return this.drafts.create(this.actor(req), {
      courseId: body.courseId,
      type: body.type,
      workType: body.workType,
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      attachments: body.attachments,
    });
  }

  @Patch('task-drafts/:draftId')
  async update(
    @Param('draftId') draftId: string,
    @Body() body: UpdateTaskDraftDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StoredTaskDraft> {
    return this.drafts.update(draftId, this.actor(req), {
      type: body.type,
      workType: body.workType,
      title: body.title,
      description: body.description,
      instructions: body.instructions,
      attachments: body.attachments,
    });
  }

  @Delete('task-drafts/:draftId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('draftId') draftId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.drafts.remove(draftId, this.actor(req));
  }
}
