import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type {
  RateLimitRule,
  RateLimitStore,
} from './rate-limit.interface.js';
import { RATE_LIMIT_STORE } from './rate-limit.interface.js';

export const RATE_LIMIT_KEY = 'rate_limit_rule';
export const SKIP_RATE_LIMIT_KEY = 'skip_rate_limit';

/** Tightens (or loosens) the limit for one route or controller. */
export const RateLimit = (rule: RateLimitRule) =>
  SetMetadata(RATE_LIMIT_KEY, rule);

/** Opts a route out entirely. Use sparingly and say why at the call site. */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/** Applies to any route without its own @RateLimit. */
export const DEFAULT_RATE_LIMIT: RateLimitRule = {
  limit: 120,
  windowMs: 60_000,
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMIT_STORE)
    private readonly store: RateLimitStore,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') {
      return true;
    }
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) {
      return true;
    }

    const rule =
      this.reflector.getAllAndOverride<RateLimitRule | undefined>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? DEFAULT_RATE_LIMIT;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const decision = this.store.hit(this.buildKey(context, request), rule);

    const response = http.getResponse<Response>();
    response.setHeader('X-RateLimit-Limit', rule.limit);
    response.setHeader('X-RateLimit-Remaining', decision.remaining);
    response.setHeader(
      'X-RateLimit-Reset',
      Math.ceil(decision.resetAt / 1000),
    );

    if (!decision.allowed) {
      const retryAfter = Math.max(
        1,
        Math.ceil((decision.resetAt - Date.now()) / 1000),
      );
      response.setHeader('Retry-After', retryAfter);
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /**
   * Scoped per route so a burst of reads cannot consume a user's login
   * allowance.
   *
   * Keyed on the address, which must therefore be trustworthy: `request.ip`
   * honours X-Forwarded-For only as far as Express `trust proxy` allows, and
   * main.ts defaults that to 0 so a client-supplied header is ignored. Set the
   * hop count to match the real deployment or this is spoofable.
   *
   * Not keyed on the authenticated user: this runs as a global guard, and Nest
   * runs those before the route-level JwtAuthGuard, so `request.user` is not
   * populated yet. Per-account limiting needs a second guard downstream of
   * authentication.
   */
  private buildKey(context: ExecutionContext, request: Request): string {
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    return `${route}:ip:${request.ip ?? 'unknown'}`;
  }
}
