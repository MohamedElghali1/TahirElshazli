import { describe, expect, it } from 'vitest';
import { lastCompletedWeekStart, weekStartFor, weekWindow } from './week.js';

describe('weekStartFor', () => {
  it('Friday 23:59:59 Cairo is still the week that started the preceding Saturday', () => {
    // 2026-09-25T23:59:59 Cairo (+3)
    expect(weekStartFor(new Date('2026-09-25T20:59:59.000Z'))).toBe('2026-09-19');
  });

  it('Saturday 00:00:00 Cairo is the start of the next week', () => {
    // 2026-09-26T00:00:00 Cairo (+3)
    expect(weekStartFor(new Date('2026-09-25T21:00:00.000Z'))).toBe('2026-09-26');
  });
});

describe('weekWindow', () => {
  it('is 167h across the 2026 DST start (last Friday of April falls inside the week); from/to at exact Cairo midnight', () => {
    const { from, to } = weekWindow('2026-04-18');
    expect(from.toISOString()).toBe('2026-04-17T22:00:00.000Z'); // 2026-04-18 00:00 Cairo (+2)
    expect(to.toISOString()).toBe('2026-04-24T21:00:00.000Z'); // 2026-04-25 00:00 Cairo (+3)
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(167);
  });

  it('is 169h across the 2026 DST end (last Thursday of October); from/to at exact Cairo midnight', () => {
    const { from, to } = weekWindow('2026-10-24');
    expect(from.toISOString()).toBe('2026-10-23T21:00:00.000Z'); // 2026-10-24 00:00 Cairo (+3)
    expect(to.toISOString()).toBe('2026-10-30T22:00:00.000Z'); // 2026-10-31 00:00 Cairo (+2)
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(169);
  });

  it('a week outside any transition is the ordinary 168h', () => {
    const { from, to } = weekWindow('2026-09-19');
    expect((to.getTime() - from.getTime()) / 3_600_000).toBe(168);
  });
});

describe('lastCompletedWeekStart', () => {
  it('on a Saturday 00:30 Cairo, is the week before the one that just started', () => {
    // 2026-09-26T00:30:00 Cairo (+3)
    expect(lastCompletedWeekStart(new Date('2026-09-25T21:30:00.000Z'))).toBe('2026-09-19');
  });
});
