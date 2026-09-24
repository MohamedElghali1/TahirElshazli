import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AnnotationFileCount,
  AnnotationPatch,
  NewAnnotation,
  StoredAnnotation,
  SubmissionAnnotationRepository,
} from '../interfaces/submission-annotation-repository.interface.js';

/**
 * A copy sharing nothing with its source. `path` is an array of arrays, so a
 * spread alone would alias the points - and `findById` feeds an audit `before`
 * (CLAUDE.md §9: the aliasing defect shipped twice).
 */
function copy(a: StoredAnnotation): StoredAnnotation {
  return { ...a, path: a.path === null ? null : a.path.map(([x, y]) => [x, y]) };
}

/** `(page, createdAt, id)` - the Postgres driver's order. */
function byPageThenTime(a: StoredAnnotation, b: StoredAnnotation): number {
  return (
    a.page - b.page ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Annotations in memory. No FK here: `ON DELETE CASCADE` from the submission
 * has no counterpart, because the product never deletes a submission - delete
 * is refused once anything is submitted - so there is no path that would need
 * it (unit-7 plan, `019`).
 */
@Injectable()
export class InMemorySubmissionAnnotationRepository
  implements SubmissionAnnotationRepository
{
  private annotations: StoredAnnotation[] = [];

  async findBySubmission(submissionId: string): Promise<StoredAnnotation[]> {
    return this.annotations
      .filter((a) => a.submissionId === submissionId)
      .sort(byPageThenTime)
      .map(copy);
  }

  async findById(annotationId: string): Promise<StoredAnnotation | null> {
    const found = this.annotations.find((a) => a.id === annotationId);
    return found ? copy(found) : null;
  }

  async create(input: NewAnnotation): Promise<StoredAnnotation> {
    const now = new Date().toISOString();
    const stored = copy({ ...input, id: randomUUID(), createdAt: now, updatedAt: now });
    this.annotations.push(stored);
    return copy(stored);
  }

  async update(
    annotationId: string,
    patch: AnnotationPatch,
  ): Promise<StoredAnnotation | null> {
    const found = this.annotations.find((a) => a.id === annotationId);
    if (!found) {
      return null;
    }
    if (patch.page !== undefined) found.page = patch.page;
    if (patch.xPercent !== undefined) found.xPercent = patch.xPercent;
    if (patch.yPercent !== undefined) found.yPercent = patch.yPercent;
    if (patch.text !== undefined) found.text = patch.text;
    if (patch.path !== undefined) found.path = patch.path.map(([x, y]) => [x, y]);
    found.updatedAt = new Date().toISOString();
    return copy(found);
  }

  async remove(annotationId: string): Promise<boolean> {
    const before = this.annotations.length;
    this.annotations = this.annotations.filter((a) => a.id !== annotationId);
    return this.annotations.length < before;
  }

  async countBySubmission(submissionId: string): Promise<number> {
    return this.annotations.filter((a) => a.submissionId === submissionId).length;
  }

  async countBySubmissionFiles(
    submissionIds: readonly string[],
  ): Promise<AnnotationFileCount[]> {
    const wanted = new Set(submissionIds);
    const counts = new Map<string, AnnotationFileCount>();
    for (const a of this.annotations) {
      if (!wanted.has(a.submissionId)) continue;
      const key = `${a.submissionId}\u0000${a.fileUrl}`;
      const entry = counts.get(key) ?? { submissionId: a.submissionId, fileUrl: a.fileUrl, count: 0 };
      entry.count += 1;
      counts.set(key, entry);
    }
    return [...counts.values()];
  }
}
