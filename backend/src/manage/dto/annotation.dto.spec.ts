import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnnotationPatchDto, AnnotationWriteDto } from './annotation.dto.js';
import { isPointList } from '../../common/validators/is-point-list.validator.js';

const ok = { fileUrl: '/uploads/a.png', page: 1, kind: 'tick', xPercent: 10, yPercent: 20 };

async function errorsOf<T extends object>(cls: new () => T, body: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, body), { whitelist: true });
  return errors.map((e) => e.property);
}

describe('AnnotationWriteDto', () => {
  it('accepts a pin and a stroke', async () => {
    expect(await errorsOf(AnnotationWriteDto, ok)).toEqual([]);
    expect(await errorsOf(AnnotationWriteDto, { ...ok, kind: 'pen', path: [[0, 0], [100, 100]] })).toEqual([]);
  });

  it.each([
    ['page 0', { page: 0 }, 'page'],
    ['page 501', { page: 501 }, 'page'],
    ['a fractional page', { page: 1.5 }, 'page'],
    ['kind eraser', { kind: 'eraser' }, 'kind'],
    ['x over 100', { xPercent: 100.01 }, 'xPercent'],
    ['y under 0', { yPercent: -1 }, 'yPercent'],
    ['text over 2000', { text: 'x'.repeat(2001) }, 'text'],
    ['a null text', { text: null }, 'text'],
    ['a one-point path', { path: [[1, 1]] }, 'path'],
    ['a point out of range', { path: [[1, 1], [101, 1]] }, 'path'],
    ['a malformed point', { path: [[1, 1], ['a', 1]] }, 'path'],
    ['a three-number point', { path: [[1, 1], [1, 1, 1]] }, 'path'],
    ['an empty fileUrl', { fileUrl: '' }, 'fileUrl'],
  ])('refuses %s', async (_label, patch, field) => {
    expect(await errorsOf(AnnotationWriteDto, { ...ok, ...patch })).toContain(field);
  });

  it('refuses a path over 2000 points', async () => {
    const path = Array.from({ length: 2001 }, () => [1, 1]);
    expect(await errorsOf(AnnotationWriteDto, { ...ok, kind: 'pen', path })).toContain('path');
  });
});

describe('AnnotationPatchDto', () => {
  it('strips kind and fileUrl rather than applying them', () => {
    const dto = plainToInstance(AnnotationPatchDto, { kind: 'pen', fileUrl: '/uploads/x.png', xPercent: 5 });
    return validate(dto, { whitelist: true }).then((errors) => {
      expect(errors).toEqual([]);
      expect(dto).not.toHaveProperty('kind');
      expect(dto).not.toHaveProperty('fileUrl');
      expect(dto.xPercent).toBe(5);
    });
  });

  it('refuses null for a NOT NULL column', async () => {
    expect(await errorsOf(AnnotationPatchDto, { xPercent: null })).toContain('xPercent');
    expect(await errorsOf(AnnotationPatchDto, { path: null })).toContain('path');
  });
});

describe('isPointList', () => {
  it('bounds the length and every point', () => {
    expect(isPointList([[0, 0], [100, 100]])).toBe(true);
    expect(isPointList([[0, 0]])).toBe(false);
    expect(isPointList('nope')).toBe(false);
    expect(isPointList([[0, 0], [Number.NaN, 1]])).toBe(false);
    expect(isPointList([[0, 0], [Number.POSITIVE_INFINITY, 1]])).toBe(false);
  });
});
