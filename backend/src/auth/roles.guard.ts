import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './roles.enum.js';
import { ROLES_KEY } from './roles.decorator.js';
import type { JwtPayload } from './jwt.strategy.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
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
    return requiredRoles.some((role) => user.role === role);
  }
}
