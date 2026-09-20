import { describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import {
  ALL_CAPABILITIES,
  assertMay,
  may,
  type Capability,
} from './capabilities.js';
import { Role } from './roles.enum.js';

/**
 * `AUTH-3`. One refusal test per withheld verb, all four, even though three of
 * them have no route yet - the **preset** is what is under test, and the routes
 * arrive with `DOM-4` and `PEOPLE-1`. A preset nobody asserts is a comment.
 *
 * Declared as an exhaustive `Record<Capability, true>` and not as an array, so a
 * fifth capability fails **twice**: here at compile time, because the `Record`
 * is missing a key, and at run time in the test below, because the module's own
 * `ALL_CAPABILITIES` has grown and this has not. The second failure is the
 * load-bearing one - vitest transpiles without typechecking, so the compile
 * error alone would not turn `npm test` red.
 */
const WITHHELD_PRESET: Record<Capability, true> = {
  'account.delete': true,
  'enrollment.remove': true,
  'group.member.remove': true,
  'registration.reject': true,
};

const WITHHELD = Object.keys(WITHHELD_PRESET) as Capability[];

const ASSISTANT = { role: Role.Assistant };
const TEACHER = { role: Role.Teacher };
const FULL_ADMIN = { role: Role.Admin };

describe('assistant capabilities', () => {
  it('covers every capability in the union', () => {
    // The list in this file mirrors a union, so it is asserted against the
    // module's own `ALL_CAPABILITIES` - which is derived from the exhaustive
    // `Record` the module holds - rather than trusted: a spec that iterates an
    // array can only prove that what is listed works, never that nothing is
    // missing (CLAUDE.md §10).
    //
    // This is the assertion that makes `describe.each(WITHHELD)` below a
    // mechanism. Add a fifth capability and it fails here, so the verb cannot
    // ship without a refusal test - which is exactly how six audit actions came
    // to log correctly and then be rejected by the log's own filter.
    expect([...WITHHELD].sort()).toEqual([...ALL_CAPABILITIES].sort());
    expect(new Set(WITHHELD).size).toBe(WITHHELD.length);
  });

  describe.each(WITHHELD)('%s', (capability) => {
    it('is refused for an assistant', () => {
      expect(may(ASSISTANT, capability)).toBe(false);
      expect(() => assertMay(ASSISTANT, capability)).toThrow(
        ForbiddenException,
      );
    });

    it('is held by the teacher', () => {
      expect(may(TEACHER, capability)).toBe(true);
      expect(() => assertMay(TEACHER, capability)).not.toThrow();
    });

    it('is held by the full admin', () => {
      // Identical in permission to the teacher. If this ever diverges, the
      // admin has stopped being "the teacher under their own identity" and
      // `CHANGELOG.md`'s reason for the role no longer holds.
      expect(may(FULL_ADMIN, capability)).toBe(true);
      expect(() => assertMay(FULL_ADMIN, capability)).not.toThrow();
    });

    it.each([Role.Student, Role.Parent, Role.Visitor, '', 'root', 'ADMIN'])(
      'is refused for %s',
      (role) => {
        // Default-deny, matching `staff-scope.service.spec.ts`'s "should not
        // treat any other role as unscoped". Note `'ADMIN'`: the comparison is
        // case-sensitive and must stay so, or a mis-cased value from a hand-made
        // token would pass.
        expect(may({ role }, capability)).toBe(false);
        expect(() => assertMay({ role }, capability)).toThrow(
          ForbiddenException,
        );
      },
    );
  });

  it('refuses all four with a byte-identical message', () => {
    // A message naming the capability would hand a caller probing the API a
    // free map of the permission model, one refusal at a time.
    const messages = WITHHELD.map((capability) => {
      try {
        assertMay(ASSISTANT, capability);
        throw new Error(`${capability} was not refused`);
      } catch (error) {
        return (error as ForbiddenException).message;
      }
    });
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toBe('Assistants cannot perform this action.');
    // And it names no capability.
    for (const capability of WITHHELD) {
      expect(messages[0]).not.toContain(capability);
    }
  });

  it('leaks nothing about the resource or the rule', () => {
    // CLAUDE.md §6: no SQL, no internal identifier, no stack detail.
    const thrown = (() => {
      try {
        assertMay(ASSISTANT, 'group.member.remove');
        return null;
      } catch (error) {
        return error as ForbiddenException;
      }
    })();
    expect(thrown).toBeInstanceOf(ForbiddenException);
    expect(thrown!.getStatus()).toBe(403);
    expect(thrown!.message).not.toMatch(/select|from |where |group_/i);
  });
});
