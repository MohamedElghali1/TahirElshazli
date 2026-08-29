import { InMemoryRateLimitStore } from './in-memory-rate-limit.store.js';
import type { RateLimitRule } from './rate-limit.interface.js';

const RULE: RateLimitRule = { limit: 3, windowMs: 60_000 };

describe('InMemoryRateLimitStore', () => {
  let store: InMemoryRateLimitStore;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-29T12:00:00Z'));
    store = new InMemoryRateLimitStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the limit and blocks the next one', () => {
    expect(store.hit('k', RULE).allowed).toBe(true);
    expect(store.hit('k', RULE).allowed).toBe(true);
    expect(store.hit('k', RULE).allowed).toBe(true);
    expect(store.hit('k', RULE).allowed).toBe(false);
  });

  it('counts down the remaining allowance and never goes negative', () => {
    expect(store.hit('k', RULE).remaining).toBe(2);
    expect(store.hit('k', RULE).remaining).toBe(1);
    expect(store.hit('k', RULE).remaining).toBe(0);
    expect(store.hit('k', RULE).remaining).toBe(0);
  });

  it('keeps separate counters per key', () => {
    store.hit('a', RULE);
    store.hit('a', RULE);
    store.hit('a', RULE);
    expect(store.hit('a', RULE).allowed).toBe(false);
    // A different caller is unaffected - the property that stops one attacker
    // locking out the whole platform.
    expect(store.hit('b', RULE).allowed).toBe(true);
  });

  it('starts a fresh window once the old one expires', () => {
    for (let i = 0; i < 4; i += 1) {
      store.hit('k', RULE);
    }
    expect(store.hit('k', RULE).allowed).toBe(false);

    vi.advanceTimersByTime(RULE.windowMs + 1);
    expect(store.hit('k', RULE).allowed).toBe(true);
  });

  it('does not reset the window early on a partial wait', () => {
    store.hit('k', RULE);
    store.hit('k', RULE);
    store.hit('k', RULE);
    vi.advanceTimersByTime(RULE.windowMs - 1_000);
    expect(store.hit('k', RULE).allowed).toBe(false);
  });

  it('reports a reset time inside the window', () => {
    const decision = store.hit('k', RULE);
    expect(decision.resetAt).toBe(Date.now() + RULE.windowMs);
  });

  it('sweeps expired windows so varied keys cannot grow the map forever', () => {
    for (let i = 0; i < 50; i += 1) {
      store.hit(`ip-${i}`, RULE);
    }
    vi.advanceTimersByTime(RULE.windowMs + 60_001);
    // Any hit past the sweep interval drops the expired entries.
    store.hit('trigger', RULE);
    const windows = store as unknown as { windows: Map<string, unknown> };
    expect(windows.windows.size).toBe(1);
  });
});
