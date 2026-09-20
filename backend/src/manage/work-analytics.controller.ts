import {
  Body,
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
import {
  WorkAnalyticsService,
  type StudentWorkResult,
  type StudentWorkRow,
  type WorkAnalytics,
} from '../assessments/work-analytics.service.js';
import {
  GoogleFormSyncService,
  type SyncOutcome,
} from '../assessments/google-form-sync.service.js';
import { WorkAnalyticsGateService } from './work-analytics-gate.service.js';
import { AttachResultDto } from './dto/work-analytics.dto.js';
import type { ExternalResult } from '../assessments/interfaces/work-repository.interface.js';

/**
 * `/staff/assessments/:id/*` - how a piece of work went, and who has not done it.
 *
 * On the **staff** controller surface rather than admin, because §2.2 gives a
 * TA grading and §5.18 gives them authoring: a TA who can set work and mark it
 * can obviously see whether it was done. What stays teacher-only is the
 * *integration* itself (connecting the Google account), which is a different
 * kind of power - §5.11.1 widened visibility, never capability.
 *
 * Every route resolves the course from the **assessment** and scopes on that,
 * never on a course id from the path. That is the same shape
 * `POST /staff/submissions/:id/grade` uses and for the same reason: an
 * assessment id from a course the caller does not hold must not be smuggled in
 * behind a course id that they do.
 */
@Controller('staff')
@Roles(...STAFF_ALL)
export class WorkAnalyticsController {
  constructor(
    private readonly analytics: WorkAnalyticsService,
    private readonly formSync: GoogleFormSyncService,
    private readonly gate: WorkAnalyticsGateService,
  ) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /** Completion, averages, and the unmatched count. */
  @Get('assessments/:assessmentId/analytics')
  async analyticsFor(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<WorkAnalytics> {
    await this.gate.assertMayRead(assessmentId, this.actor(req));
    return this.analytics.forAssessment(assessmentId);
  }

  /**
   * Every expected student and where they stand - including the ones who did
   * nothing, which is the question this screen exists to answer.
   */
  @Get('assessments/:assessmentId/results')
  async results(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentWorkRow[]> {
    await this.gate.assertMayRead(assessmentId, this.actor(req));
    return this.analytics.rosterForAssessment(assessmentId);
  }

  /**
   * Responses that matched no student - the reconciliation queue.
   *
   * Its own route rather than a flag on `results`, because it answers a
   * different question ("whose work am I failing to count?") and because a
   * non-empty queue means the completion figures are understated.
   */
  @Get('assessments/:assessmentId/unmatched')
  async unmatched(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<ExternalResult[]> {
    await this.gate.assertMayRead(assessmentId, this.actor(req));
    return this.gate.unmatched(assessmentId);
  }

  /**
   * Pulls the latest responses from the provider.
   *
   * A POST rather than a GET even though it reads from Google, because it
   * rewrites the stored mirror - and because a GET would be retried by every
   * proxy and prefetcher between here and the browser.
   *
   * Manual rather than scheduled, deliberately. A background poller across
   * every form would spend the Google quota on tasks nobody is looking at; at
   * CLAUDE.md §7.3's numbers, refreshing the one assignment a teacher has open
   * is both cheaper and more predictable. A scheduled sweep is the obvious
   * later addition and nothing here is in its way.
   */
  @Post('assessments/:assessmentId/sync')
  @HttpCode(HttpStatus.OK)
  async sync(
    @Param('assessmentId') assessmentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<SyncOutcome> {
    await this.gate.assertMayRead(assessmentId, this.actor(req));
    return this.formSync.sync(assessmentId);
  }

  /**
   * One student's results across a course's work - the table the client drew:
   * *Work | Type | Status | Score | Result*.
   *
   * Course-scoped rather than platform-wide, and that is the access control
   * rather than a convenience: `assertAssigned` runs on the course in the path,
   * so a TA cannot read a student's record for a course they do not hold. A
   * route keyed only on the student would have nothing to scope by and would
   * hand any staff member every mark that student has ever received.
   *
   * Only work that was **set for one of this student's groups** appears, for
   * the same reason the student's own list is filtered (§5.16) - a report
   * listing tasks they were never given would show "not started" against work
   * nobody asked them to do.
   */
  @Get('courses/:courseId/students/:studentId/work')
  async studentWork(
    @Param('courseId') courseId: string,
    @Param('studentId') studentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentWorkResult[]> {
    return this.gate.studentWork(courseId, studentId, this.actor(req));
  }

  /**
   * One response in full, including the per-question answers - what the
   * client's "View" action opens.
   *
   * Separate from the roster read on purpose: the roster is one row per student
   * and is rendered for a whole cohort, while this carries the provider's raw
   * payload. Folding the payload into the list would multiply a table of thirty
   * by however many questions the form has, to render a column nobody has
   * clicked yet.
   */
  @Get('results/:resultId')
  async result(
    @Param('resultId') resultId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<ExternalResult> {
    return this.gate.result(resultId, this.actor(req));
  }

  /**
   * Attributes an unmatched response to a student, and remembers the address so
   * it matches by itself next time.
   *
   * The second half is what makes this a fix rather than a chore: without it,
   * the same student's next response lands unmatched again and staff reconcile
   * the same person every week.
   */
  @Post('results/:resultId/attach')
  @HttpCode(HttpStatus.OK)
  async attach(
    @Param('resultId') resultId: string,
    @Body() body: AttachResultDto,
    @Request() req: { user: JwtPayload },
  ): Promise<ExternalResult> {
    return this.gate.attach(resultId, body.studentId, this.actor(req));
  }
}
