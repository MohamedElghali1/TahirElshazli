import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ExternalResult,
  GoogleFormBinding,
  NewExternalResult,
  NewGoogleFormBinding,
  ResultProvider,
  ResultTally,
  WorkRepository,
} from '../interfaces/work-repository.interface.js';

@Injectable()
export class InMemoryWorkRepository implements WorkRepository {
  private readonly bindings = new Map<string, GoogleFormBinding>();
  private readonly results: ExternalResult[] = [];

  /**
   * Copies on the way out, never the stored object.
   *
   * CLAUDE.md §7.1 records this being got wrong twice, both times producing an
   * audit entry whose `before` and `after` were the same object and therefore
   * read identical. Nothing here is audited yet, but a reader holding a live
   * reference into this array would see a sync mutate it underneath them.
   */
  private copyResult(result: ExternalResult): ExternalResult {
    return { ...result };
  }

  async findBinding(assessmentId: string): Promise<GoogleFormBinding | null> {
    const binding = this.bindings.get(assessmentId);
    return binding ? { ...binding } : null;
  }

  async findBindings(
    assessmentIds: readonly string[],
  ): Promise<Record<string, GoogleFormBinding>> {
    const out: Record<string, GoogleFormBinding> = {};
    for (const id of assessmentIds) {
      const binding = this.bindings.get(id);
      if (binding) {
        out[id] = { ...binding };
      }
    }
    return out;
  }

  async upsertBinding(
    input: NewGoogleFormBinding,
  ): Promise<GoogleFormBinding> {
    const existing = this.bindings.get(input.assessmentId);
    const binding: GoogleFormBinding = {
      ...input,
      // Preserved across a re-bind: when the form was first attached is a fact
      // about this task, and resetting it on every metadata refresh would make
      // it meaningless.
      boundAt: existing?.boundAt ?? new Date().toISOString(),
      lastSyncedAt: existing?.lastSyncedAt ?? null,
      // Cleared: re-binding is the fix for "the form moved accounts", so
      // carrying the old failure forward would warn about a repaired binding.
      lastSyncError: null,
    };
    this.bindings.set(input.assessmentId, binding);
    return { ...binding };
  }

  async removeBinding(assessmentId: string): Promise<boolean> {
    return this.bindings.delete(assessmentId);
  }

  async markSynced(assessmentId: string, error: string | null): Promise<void> {
    const binding = this.bindings.get(assessmentId);
    if (binding) {
      binding.lastSyncError = error;
      // Only stamped on success. A failed attempt must not make the screen say
      // "last synced just now" next to stale numbers.
      if (!error) {
        binding.lastSyncedAt = new Date().toISOString();
      }
    }
  }

  async replaceResults(
    assessmentId: string,
    provider: ResultProvider,
    incoming: readonly NewExternalResult[],
  ): Promise<ExternalResult[]> {
    const isMine = (r: ExternalResult) =>
      r.assessmentId === assessmentId && r.provider === provider;
    // Identity is preserved across a re-sync by matching on the provider's own
    // id: the interface promises it, and without it every refresh would
    // renumber rows that a reconciliation screen may be holding.
    const existingByExternalId = new Map(
      this.results.filter(isMine).map((r) => [r.externalId, r]),
    );

    const now = new Date().toISOString();
    const next = incoming.map((result) => {
      const previous = existingByExternalId.get(result.externalId);
      return {
        ...result,
        id: previous?.id ?? randomUUID(),
        // A manual attribution survives a re-sync. The provider does not know
        // about it, so taking `studentId` straight from the payload would undo
        // a staff reconciliation on the next refresh - the one bug in this
        // method that would be genuinely hard to notice.
        studentId: result.studentId ?? previous?.studentId ?? null,
        syncedAt: now,
      };
    });

    for (let i = this.results.length - 1; i >= 0; i -= 1) {
      if (isMine(this.results[i])) {
        this.results.splice(i, 1);
      }
    }
    this.results.push(...next);
    return next.map((r) => this.copyResult(r));
  }

  async findResults(assessmentId: string): Promise<ExternalResult[]> {
    return this.results
      .filter((r) => r.assessmentId === assessmentId)
      .map((r) => this.copyResult(r));
  }

  async findResultById(resultId: string): Promise<ExternalResult | null> {
    const result = this.results.find((r) => r.id === resultId);
    return result ? this.copyResult(result) : null;
  }

  async findUnmatchedResults(assessmentId: string): Promise<ExternalResult[]> {
    return this.results
      .filter((r) => r.assessmentId === assessmentId && r.studentId === null)
      .map((r) => this.copyResult(r));
  }

  async findResultsForStudent(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<ExternalResult[]> {
    const wanted = new Set(assessmentIds);
    return this.results
      .filter((r) => r.studentId === studentId && wanted.has(r.assessmentId))
      .map((r) => this.copyResult(r));
  }

  async attachResultToStudent(
    resultId: string,
    studentId: string,
  ): Promise<ExternalResult | null> {
    const result = this.results.find((r) => r.id === resultId);
    // Refused when already attributed: silently reassigning a mark from one
    // student to another is not something a reconciliation screen should be
    // able to do by accident.
    if (!result || result.studentId !== null) {
      return null;
    }
    result.studentId = studentId;
    return this.copyResult(result);
  }

  async tallyResults(assessmentId: string): Promise<ResultTally> {
    const mine = this.results.filter((r) => r.assessmentId === assessmentId);
    const matched = mine.filter((r) => r.studentId !== null);
    const scored = matched.filter(
      (r) => r.score !== null && r.maxScore !== null,
    );
    const mean = (values: number[]) =>
      values.length
        ? values.reduce((sum, v) => sum + v, 0) / values.length
        : null;
    return {
      matched: matched.length,
      unmatched: mine.length - matched.length,
      averageScore: mean(scored.map((r) => r.score!)),
      averageMaxScore: mean(scored.map((r) => r.maxScore!)),
    };
  }

  async countResultsByAssessments(
    assessmentIds: readonly string[],
    studentId: string,
  ): Promise<Record<string, number>> {
    const wanted = new Set(assessmentIds);
    const out: Record<string, number> = {};
    for (const result of this.results) {
      if (result.studentId === studentId && wanted.has(result.assessmentId)) {
        out[result.assessmentId] = (out[result.assessmentId] ?? 0) + 1;
      }
    }
    return out;
  }
}
