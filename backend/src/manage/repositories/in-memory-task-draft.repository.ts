import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  NewTaskDraft,
  StoredTaskDraft,
  TaskDraftFilter,
  TaskDraftRepository,
  TaskDraftUpdate,
} from '../interfaces/task-draft-repository.interface.js';

/**
 * A copy that shares nothing with the stored row. `attachments` holds objects,
 * so a spread alone would alias them - and a read feeding an audit `before`
 * must never alias its `after` (CLAUDE.md §9).
 */
function copy(draft: StoredTaskDraft): StoredTaskDraft {
  return { ...draft, attachments: draft.attachments.map((a) => ({ ...a })) };
}

/**
 * Starts empty, unlike most in-memory repositories here. A seeded draft would
 * be content in Dr. Tahir's name that nobody wrote - the same reason the audit
 * log and announcements are not seeded.
 */
@Injectable()
export class InMemoryTaskDraftRepository implements TaskDraftRepository {
  private drafts: StoredTaskDraft[] = [];

  async findMany(filter: TaskDraftFilter): Promise<StoredTaskDraft[]> {
    if (filter.courseIds !== null && filter.courseIds.length === 0) {
      return [];
    }
    const reach = filter.courseIds === null ? null : new Set(filter.courseIds);
    return this.drafts
      .filter((d) => reach === null || reach.has(d.courseId))
      .filter((d) => !filter.courseId || d.courseId === filter.courseId)
      .filter((d) => !filter.type || d.type === filter.type)
      .sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      )
      .map(copy);
  }

  async findById(id: string): Promise<StoredTaskDraft | null> {
    const found = this.drafts.find((d) => d.id === id);
    return found ? copy(found) : null;
  }

  async create(input: NewTaskDraft): Promise<StoredTaskDraft> {
    const now = new Date().toISOString();
    const stored = copy({
      ...input,
      id: randomUUID(),
      usedCount: 0,
      createdAt: now,
      updatedAt: now,
    });
    this.drafts.push(stored);
    return copy(stored);
  }

  async update(id: string, patch: TaskDraftUpdate): Promise<StoredTaskDraft | null> {
    const index = this.drafts.findIndex((d) => d.id === id);
    if (index === -1) {
      return null;
    }
    const current = this.drafts[index];
    const next: StoredTaskDraft = copy({
      ...current,
      type: patch.type ?? current.type,
      workType: patch.workType ?? current.workType,
      title: patch.title ?? current.title,
      description: patch.description ?? current.description,
      instructions: patch.instructions ?? current.instructions,
      attachments: patch.attachments ?? current.attachments,
      updatedAt: new Date().toISOString(),
    });
    this.drafts[index] = next;
    return copy(next);
  }

  async remove(id: string): Promise<boolean> {
    const before = this.drafts.length;
    // The FK's ON DELETE SET NULL on `assessments.draft_id` is the assessment
    // repository's side of this; a repository never reaches into another, so
    // the memory driver simply leaves a dangling provenance id there.
    this.drafts = this.drafts.filter((d) => d.id !== id);
    return this.drafts.length !== before;
  }

  async incrementUsedCount(
    id: string,
    courseId: string,
  ): Promise<StoredTaskDraft | null> {
    const found = this.drafts.find((d) => d.id === id && d.courseId === courseId);
    if (!found) {
      return null;
    }
    found.usedCount += 1;
    return copy(found);
  }
}
