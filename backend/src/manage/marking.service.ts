import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AssessmentRepository } from '../assessments/interfaces/assessment-repository.interface.js';
import { ASSESSMENT_REPOSITORY } from '../assessments/interfaces/assessment-repository.interface.js';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { AuditService } from '../audit/audit.service.js';
import { DatabaseService } from '../database/database.service.js';
import { actorRoleOf } from '../auth/actor-role.js';
import type { StaffActor } from '../staff/staff-scope.service.js';
import { SubmissionAccessService, SUBMISSION_NOT_FOUND } from './submission-access.service.js';
import { toGradingQueueItem, type GradingQueueItem } from './grading.service.js';

/** A return with no mark to hand back (assumption A-3). */
export const RETURN_NEEDS_MARK = 'Enter a mark before returning this work.';

/**
 * Marking (unit 7): handing work back, the per-task queue, and the marks on
 * the paper.
 *
 * Every route that names a submission goes through
 * `SubmissionAccessService.loadInScope` first - the group grain (`D-23`) - so
 * an out-of-scope paper is the same 404 as a missing one before any 403 or 409
 * can speak.
 */
@Injectable()
export class MarkingService {
  constructor(
    private readonly access: SubmissionAccessService,
    @Inject(ASSESSMENT_REPOSITORY)
    private readonly assessmentRepo: AssessmentRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: UserRepository,
    private readonly audit: AuditService,
    /** `DatabaseModule` is `@Global()`; this needs no import edge. */
    private readonly db: DatabaseService,
  ) {}

  /**
   * Hand marked work back to the student (`MARK-2`). Saving a mark and
   * returning it are two operations: this is the one that makes the score,
   * feedback and annotations visible to the student.
   *
   * - Unmarked: **409** (A-3) - there is nothing to hand back.
   * - Already returned: **200** with the current state, **no second audit
   *   entry**, and `returnedAt` keeps the first return's time (A-3). There is
   *   no un-return: no document asks for one.
   */
  async returnSubmission(submissionId: string, actor: StaffActor): Promise<GradingQueueItem> {
    return this.db.runInTransaction(async () => {
      const { submission, assessment } = await this.access.loadInScope(submissionId, actor);
      if (submission.correctedAt === null) {
        throw new ConflictException(RETURN_NEEDS_MARK);
      }
      const student = await this.userRepo.findById(submission.studentId);
      if (submission.returnedAt !== null) {
        return toGradingQueueItem(submission, assessment, student);
      }
      const returned = await this.assessmentRepo.returnSubmission(submissionId);
      if (!returned) {
        // Deleted between the read and the write.
        throw new NotFoundException(SUBMISSION_NOT_FOUND);
      }
      await this.audit.record({
        actorId: actor.id,
        actorRole: actorRoleOf(actor),
        action: 'submission.returned',
        targetType: 'assessment_submission',
        targetId: submissionId,
        courseId: assessment.courseId,
        before: { returnedAt: null },
        after: { returnedAt: returned.returnedAt, score: returned.score },
      });
      return toGradingQueueItem(returned, assessment, student);
    });
  }
}
