import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './roles.enum.js';
import { ROLES_KEY } from './roles.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ANY_ROLE_KEY } from './any-role.decorator.js';
import type { JwtPayload } from './jwt.strategy.js';

/**
 * Registered globally, and **fail-closed**: a route with no `@Roles(...)` is
 * refused rather than admitted.
 *
 * The previous default was the opposite - a missing `@Roles` returned `true` -
 * which is safe only as long as every controller remembers the decorator. That
 * held while the student surface was the only one, but the half-mistake it
 * invites (remembering `@UseGuards`, forgetting `@Roles`) would admit every
 * logged-in account, `visitor` and `parent` included, to whatever the route
 * exposes. On a future `/api/admin/payments` that is the whole payments
 * surface handed to any registered student.
 *
 * Three ways out, all explicit:
 *   - `@Public()`      - no authentication at all (login, register, health).
 *   - `@AnyRole()`     - any authenticated account, role irrelevant (logout).
 *   - `@Roles(...)`    - the normal case.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;
    if (!user) {
      // Unreachable while JwtAuthGuard runs first, but returning false here
      // would report an unauthenticated request as 403 Forbidden, which is
      // misleading in logs. Say what actually happened.
      throw new UnauthorizedException();
    }

    const anyRole = this.reflector.getAllAndOverride<boolean>(ANY_ROLE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (anyRole) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      // Deny, and say why: the alternative is a silent 403 on a route whose
      // author simply forgot a decorator, which is a long afternoon.
      throw new ForbiddenException(
        'This route declares no @Roles(). Add one, or @AnyRole() if any ' +
          'authenticated account may call it.',
      );
    }
    return requiredRoles.some((role) => user.role === role);
  }
}
