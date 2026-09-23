import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ALL } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import type { GradingQueueItem } from './grading.service.js';
import { MarkingService, type TaskSubmissions } from './marking.service.js';

/**
 * `/staff/*` marking routes (unit 7): return, the per-task queue, and the
 * annotations. Its own controller so the class-level `@Roles(...STAFF_ALL)`
 * is the whole role story for every route in it.
 *
 * Nothing here decides access: every handler hands the actor to
 * `MarkingService`, which starts with the group-grain gate. No `@UseGuards`:
 * `JwtAuthGuard` and `RolesGuard` are global in `app.module.ts`.
 */
@Controller('staff')
@Roles(...STAFF_ALL)
export class MarkingController {
  constructor(private readonly marking: MarkingService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /**
   * Every targeted student on one task, submitted or not (`MARK-3`). Group
   * grain; 404 identical to a missing task when the caller reaches no target.
   * Also the marking view's read (A-14): there is no one-submission `GET`.
   */
  @Get('assessments/:assessmentId/submissions')
  async queue(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<TaskSubmissions> {
    return this.marking.queue(assessmentId, this.actor(req));
  }

  /** Hand marked work back to the student (`MARK-2`). 409 when unmarked. */
  @Post('submissions/:submissionId/return')
  @HttpCode(HttpStatus.OK)
  async returnSubmission(
    @Param('submissionId') submissionId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<GradingQueueItem> {
    return this.marking.returnSubmission(submissionId, this.actor(req));
  }
}
