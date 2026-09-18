import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { GoogleIntegrationService } from '../integrations/google/google-integration.service.js';
import {
  GoogleFormAccessError,
  GoogleFormsClient,
  type GoogleFormResponse,
} from '../integrations/google/google-forms.client.js';
import type {
  ExternalWorkBinder,
  GoogleFormBinding,
  NewExternalResult,
  WorkRepository,
  WorkType,
} from './interfaces/work-repository.interface.js';
import { WORK_REPOSITORY } from './interfaces/work-repository.interface.js';

export interface SyncOutcome {
  /** Responses Google returned. */
  fetched: number;
  /** Attributed to a known student. */
  matched: number;
  /**
   * Responses that matched nobody.
   *
   * Not an error, and deliberately returned rather than logged: this is the
   * number that tells a teacher their form is not collecting email addresses,
   * or that a student answered from an address this platform does not know.
   */
  unmatched: number;
  syncedAt: string;
}

/**
 * Pulls Google Form responses in and attributes them to students.
 *
 * Two jobs, and all the difficulty is in the second. Fetching is a paginated
 * HTTP read. **Matching is a judgement about identity**, and Google gives us
 * exactly one fact to make it with - an email address, and only when the form
 * was configured to collect one.
 *
 * The honest position, stated once here because every caller inherits it: this
 * service cannot attribute a response whose address this platform does not
 * recognise, and it does not guess. Unmatched responses are kept, counted and
 * queued for a human, because both alternatives are worse than a queue -
 * dropping them makes the completion count silently wrong, and matching on
 * names would eventually attach one student's mark to another.
 */
@Injectable()
export class GoogleFormSyncService implements ExternalWorkBinder {
  private readonly logger = new Logger(GoogleFormSyncService.name);

  constructor(
    @Inject(WORK_REPOSITORY) private readonly work: WorkRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly google: GoogleIntegrationService,
    private readonly forms: GoogleFormsClient,
  ) {}

  /**
   * Binds a form to an assessment, reading its metadata from Google first.
   *
   * The read is not decoration - it is what turns a pasted string into a
   * validated binding. It proves the connected account can actually see the
   * form (so the failure surfaces while a human is looking at a form, not on a
   * deadline), and it captures the responder URI, which **must** come from
   * Google because it uses a different identifier from the editing URL and
   * cannot be constructed.
   */
  /**
   * `ExternalWorkBinder`. Silently does nothing for work types this provider
   * does not own, so the authoring service can call it unconditionally instead
   * of branching on a discriminator it should not have to know the members of.
   */
  async bindExternal(
    assessmentId: string,
    workType: WorkType,
    payload: string,
  ): Promise<void> {
    if (workType !== 'google_form') {
      return;
    }
    await this.bind(assessmentId, payload);
  }

  async bind(
    assessmentId: string,
    formUrlOrId: string,
  ): Promise<GoogleFormBinding> {
    const formId = this.forms.parseFormId(formUrlOrId);
    const token = await this.google.accessToken();
    const meta = await this.forms.fetchForm(token, formId);

    return this.work.upsertBinding({
      assessmentId,
      formId: meta.formId,
      responderUri: meta.responderUri,
      title: meta.title,
      isQuiz: meta.isQuiz,
      totalPoints: meta.totalPoints,
      collectsEmail: meta.collectsEmail,
    });
  }

  /**
   * Re-reads every response for one assessment and rewrites the mirror.
   *
   * Wholesale rather than incremental. The Forms API has no "changed since"
   * filter, a respondent can edit a response they already submitted, and at
   * CLAUDE.md §7.3's numbers the largest realistic form is one cohort of about
   * thirty - so incremental sync would add reconciliation logic to save
   * nothing measurable.
   *
   * A failure is recorded on the binding **and** rethrown. Recording is what
   * lets the screen explain itself an hour later; rethrowing is what tells the
   * person who just pressed Refresh that nothing happened.
   */
  async sync(assessmentId: string): Promise<SyncOutcome> {
    const binding = await this.work.findBinding(assessmentId);
    if (!binding) {
      throw new NotFoundException('No Google Form is linked to this task.');
    }

    let responses: GoogleFormResponse[];
    let totalPoints = binding.totalPoints;
    try {
      const token = await this.google.accessToken();
      // Metadata first: a question added mid-term changes the denominator, and
      // a stale total would silently misreport every percentage below.
      const meta = await this.forms.fetchForm(token, binding.formId);
      totalPoints = meta.totalPoints;
      responses = await this.forms.fetchResponses(token, binding.formId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.work.markSynced(assessmentId, message);
      // Access errors already carry a message written for the person reading
      // it, so they travel as-is. Anything else is logged with the assessment
      // id, because by the time someone asks, the request context is gone.
      if (!(error instanceof GoogleFormAccessError)) {
        this.logger.error(
          `Sync failed for assessment ${assessmentId}: ${message}`,
        );
      }
      throw error;
    }

    const byEmail = await this.buildEmailIndex(responses);
    const mapped: NewExternalResult[] = responses.map((response) => ({
      assessmentId,
      provider: 'google_form' as const,
      externalId: response.responseId,
      studentId: response.respondentEmail
        ? (byEmail.get(response.respondentEmail.trim().toLowerCase()) ?? null)
        : null,
      respondentId: response.respondentEmail,
      score: response.totalScore,
      // The denominator travels with the row, so a later edit to the form
      // cannot retroactively rewrite what a past response was marked out of.
      maxScore: response.totalScore === null ? null : totalPoints,
      submittedAt: response.submittedAt || new Date().toISOString(),
      raw: { answers: response.answers },
    }));

    const stored = await this.work.replaceResults(
      assessmentId,
      'google_form',
      mapped,
    );
    await this.work.markSynced(assessmentId, null);

    // Counted from what was **stored**, not from what was mapped. A response a
    // staff member attributed by hand is preserved by the repository (its
    // upsert COALESCEs `student_id` rather than overwriting it), and counting
    // the mapped rows would report it as still unmatched every single sync.
    const matched = stored.filter((r) => r.studentId !== null).length;
    return {
      fetched: stored.length,
      matched,
      unmatched: stored.length - matched,
      syncedAt: new Date().toISOString(),
    };
  }

  /**
   * Builds a lowercased address → studentId index for this batch.
   *
   * One batch lookup rather than a query per response - the N+1 CLAUDE.md §7.1
   * asks new code not to add, and here N is everyone who answered.
   *
   * Two addresses can reach the same student: the one they registered under,
   * and the `googleEmail` recorded because the two differ. That second one is
   * why matching works in practice at all - students routinely fill school
   * forms in with a personal account.
   */
  private async buildEmailIndex(
    responses: readonly GoogleFormResponse[],
  ): Promise<Map<string, string>> {
    const emails = [
      ...new Set(
        responses
          .map((r) => r.respondentEmail?.trim().toLowerCase())
          .filter((e): e is string => Boolean(e)),
      ),
    ];
    if (emails.length === 0) {
      // No addresses at all: the form does not collect them. Every response
      // will be unmatched, and the count is what says so.
      return new Map();
    }
    const students = await this.users.findStudentsByEmails(emails);
    const index = new Map<string, string>();
    for (const student of students) {
      index.set(student.email.toLowerCase(), student.id);
      if (student.googleEmail) {
        index.set(student.googleEmail.toLowerCase(), student.id);
      }
    }
    return index;
  }
}
