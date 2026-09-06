import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard.js';
import { Role } from './roles.enum.js';
import { ROLES_KEY } from './roles.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ANY_ROLE_KEY } from './any-role.decorator.js';
import type { JwtPayload } from './jwt.strategy.js';

/**
 * The guard is registered globally, so its default decides what an
 * undecorated route does. These tests exist to make that default hard to
 * change by accident: a `@Roles`-less route must be refused, not admitted.
 */
function contextFor(user?: Partial<JwtPayload>): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

/** Stands in for the decorators, keyed the way `getAllAndOverride` reads them. */
function reflectorReturning(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

const student: Partial<JwtPayload> = {
  sub: 'student-1',
  role: Role.Student,
  email: 's@example.com',
};

describe('RolesGuard', () => {
  it('denies a route that declares no @Roles', () => {
    const guard = new RolesGuard(reflectorReturning({}));
    // The half-mistake this catches: remembering the guard, forgetting the
    // decorator. The old behaviour returned true here, which would admit every
    // logged-in account - visitor and parent included - to whatever the route
    // exposes.
    expect(() => guard.canActivate(contextFor(student))).toThrow(
      ForbiddenException,
    );
  });

  it('explains why, rather than returning a bare 403', () => {
    const guard = new RolesGuard(reflectorReturning({}));
    expect(() => guard.canActivate(contextFor(student))).toThrow(/@Roles\(\)/);
  });

  it('admits a matching role', () => {
    const guard = new RolesGuard(
      reflectorReturning({ [ROLES_KEY]: [Role.Student] }),
    );
    expect(guard.canActivate(contextFor(student))).toBe(true);
  });

  it('refuses a non-matching role', () => {
    const guard = new RolesGuard(
      reflectorReturning({ [ROLES_KEY]: [Role.Teacher] }),
    );
    expect(guard.canActivate(contextFor(student))).toBe(false);
  });

  it('lets @Public() through without a user', () => {
    const guard = new RolesGuard(reflectorReturning({ [IS_PUBLIC_KEY]: true }));
    expect(guard.canActivate(contextFor(undefined))).toBe(true);
  });

  it('lets @AnyRole() through for any authenticated account', () => {
    const guard = new RolesGuard(reflectorReturning({ [ANY_ROLE_KEY]: true }));
    expect(guard.canActivate(contextFor({ ...student, role: Role.Parent }))).toBe(
      true,
    );
  });

  it('still requires authentication for @AnyRole()', () => {
    const guard = new RolesGuard(reflectorReturning({ [ANY_ROLE_KEY]: true }));
    // 401, not 403: reporting an unauthenticated request as Forbidden is
    // misleading in logs.
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      UnauthorizedException,
    );
  });
});
