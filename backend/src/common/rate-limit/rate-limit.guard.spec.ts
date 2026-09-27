import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import type { Response } from 'express';
import { RateLimitGuard, RATE_LIMIT_KEY } from './rate-limit.guard.js';
import { InMemoryRateLimitStore } from './in-memory-rate-limit.store.js';
import type { RateLimitRule } from './rate-limit.interface.js';
import { LOGIN_LIMIT, REGISTER_LIMIT } from './limits.js';

function contextFor(ip: string, body?: unknown): ExecutionContext {
  const headers = new Map<string, unknown>();
  const response = {
    setHeader: (name: string, value: unknown) => headers.set(name, value),
  } as unknown as Response;
  return {
    getType: () => 'http',
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({
      getRequest: () => ({ ip, body }),
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function reflectorReturning(
  rule: RateLimitRule | RateLimitRule[],
): Reflector {
  return {
    getAllAndOverride: (key: string) =>
      key === RATE_LIMIT_KEY ? rule : undefined,
  } as unknown as Reflector;
}

describe('RateLimitGuard', () => {
  it('behaves exactly as before for a rule without `by` (IP-only)', () => {
    const store = new InMemoryRateLimitStore();
    const rule: RateLimitRule = { limit: 2, windowMs: 60_000 };
    const guard = new RateLimitGuard(reflectorReturning(rule), store);
    const ctx = contextFor('1.1.1.1', { email: 'a@example.com' });

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    // A different email from the same IP still shares the one bucket.
    expect(() =>
      guard.canActivate(contextFor('1.1.1.1', { email: 'b@example.com' })),
    ).toThrow(HttpException);
  });

  it('30 distinct emails from one IP can each log in within a minute', () => {
    const store = new InMemoryRateLimitStore();
    const guard = new RateLimitGuard(reflectorReturning(LOGIN_LIMIT), store);

    for (let i = 0; i < 30; i += 1) {
      expect(
        guard.canActivate(
          contextFor('10.0.0.1', { email: `student-${i}@example.com` }),
        ),
      ).toBe(true);
    }
  });

  it('the 6th attempt for ONE email in a minute is 429', () => {
    const store = new InMemoryRateLimitStore();
    const guard = new RateLimitGuard(reflectorReturning(LOGIN_LIMIT), store);
    const ctx = () => contextFor('10.0.0.1', { email: 'same@example.com' });

    for (let i = 0; i < 5; i += 1) {
      expect(guard.canActivate(ctx())).toBe(true);
    }
    expect(() => guard.canActivate(ctx())).toThrow(HttpException);
  });

  it('the 61st login from one IP in a minute is 429, even across distinct emails', () => {
    const store = new InMemoryRateLimitStore();
    const guard = new RateLimitGuard(reflectorReturning(LOGIN_LIMIT), store);

    for (let i = 0; i < 60; i += 1) {
      expect(
        guard.canActivate(
          contextFor('10.0.0.2', { email: `student-${i}@example.com` }),
        ),
      ).toBe(true);
    }
    expect(() =>
      guard.canActivate(contextFor('10.0.0.2', { email: 'overflow@example.com' })),
    ).toThrow(HttpException);
  });

  it('falls back to IP-only when the body has no string email', () => {
    const store = new InMemoryRateLimitStore();
    const guard = new RateLimitGuard(reflectorReturning(LOGIN_LIMIT), store);
    const ctx = () => contextFor('10.0.0.3', {});

    for (let i = 0; i < 5; i += 1) {
      expect(guard.canActivate(ctx())).toBe(true);
    }
    // No email to key by, so the ip+email rule degrades to one shared bucket.
    expect(() => guard.canActivate(ctx())).toThrow(HttpException);
  });

  it('register allows 30 per 10 minutes per IP', () => {
    const store = new InMemoryRateLimitStore();
    const guard = new RateLimitGuard(reflectorReturning(REGISTER_LIMIT), store);
    const ctx = () => contextFor('10.0.0.4', { email: 'new@example.com' });

    for (let i = 0; i < 30; i += 1) {
      expect(guard.canActivate(ctx())).toBe(true);
    }
    expect(() => guard.canActivate(ctx())).toThrow(HttpException);
  });
});
