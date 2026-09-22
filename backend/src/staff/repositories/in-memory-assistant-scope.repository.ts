import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  AssistantGroupAssignment,
  AssistantScope,
  AssistantScopeRepository,
} from '../interfaces/assistant-scope-repository.interface.js';

/**
 * Mirrors `database/seeds/002_staff_fixtures.sql`, and the gap in it is the
 * fixture.
 *
 * `assistant-1` is `assigned_groups` and holds **group-1 only**, which studies
 * course-1; `assistant-2` is `assigned_groups` and holds **nothing**. That
 * reproduces exactly what `InMemoryCourseStaffRepository` used to assert at the
 * course grain - assistant-1 reaches course-1 and not course-2 - which is what
 * lets `staff-scope.service.spec.ts`'s contract cases pass unmodified across
 * the rewrite.
 *
 * Both assistants get an explicit scope row for the same reason migration 015
 * backfills one for every assistant: an absent row means *never configured*,
 * and a fixture that leaves it absent would be testing the fail-closed path by
 * accident rather than the ordinary one.
 */
const SEED_SCOPES: ReadonlyArray<readonly [string, AssistantScope]> = [
  ['assistant-1', 'assigned_groups'],
  ['assistant-2', 'assigned_groups'],
];

const SEED_ASSIGNMENTS: readonly AssistantGroupAssignment[] = [
  {
    id: 'assistant-group-1',
    userId: 'assistant-1',
    groupId: 'group-1',
    assignedAt: '2026-02-01T09:00:00Z',
    assignedBy: 'teacher-1',
  },
];

@Injectable()
export class InMemoryAssistantScopeRepository
  implements AssistantScopeRepository
{
  /** Per-instance copies, so one test's grant does not leak into the next. */
  private readonly scopes = new Map<string, AssistantScope>(SEED_SCOPES);
  private readonly assignments: AssistantGroupAssignment[] = [
    ...SEED_ASSIGNMENTS,
  ];

  async findScope(userId: string): Promise<AssistantScope | null> {
    return this.scopes.get(userId) ?? null;
  }

  async setScope(userId: string, scope: AssistantScope): Promise<void> {
    this.scopes.set(userId, scope);
  }

  async findAssignments(userId: string): Promise<AssistantGroupAssignment[]> {
    // Copies: a caller that holds one of these while something else grants or
    // revokes must not watch its own list change underneath it (§9).
    return this.assignments
      .filter((a) => a.userId === userId)
      .map((a) => ({ ...a }));
  }

  async assignGroup(
    userId: string,
    groupId: string,
    assignedBy: string,
  ): Promise<{ assignment: AssistantGroupAssignment; created: boolean }> {
    const existing = this.assignments.find(
      (a) => a.userId === userId && a.groupId === groupId,
    );
    if (existing) {
      return { assignment: { ...existing }, created: false };
    }
    const assignment: AssistantGroupAssignment = {
      id: randomUUID(),
      userId,
      groupId,
      assignedAt: new Date().toISOString(),
      assignedBy,
    };
    this.assignments.push(assignment);
    return { assignment: { ...assignment }, created: true };
  }

  async unassignGroup(userId: string, groupId: string): Promise<boolean> {
    const index = this.assignments.findIndex(
      (a) => a.userId === userId && a.groupId === groupId,
    );
    if (index === -1) {
      return false;
    }
    this.assignments.splice(index, 1);
    return true;
  }
}
