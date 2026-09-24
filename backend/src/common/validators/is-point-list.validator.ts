import { registerDecorator, type ValidationOptions } from 'class-validator';

/** The bounds of a freehand stroke (unit-7 assumption A-11): storage, not product. */
export const MIN_STROKE_POINTS = 2;
export const MAX_STROKE_POINTS = 2000;

/**
 * True for `[[x, y], ...]` with 2-2000 points, each a pair of finite numbers in
 * 0-100 - a stroke's path as a percentage of the page box (`MARK-1`).
 *
 * Checked **per element**, not only by length: `ArrayMinSize` on the outer
 * array would pass `[["a"], null]`, and a malformed point is exactly what makes
 * an overlay render `NaN` on a real child's paper.
 */
export function isPointList(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length < MIN_STROKE_POINTS || value.length > MAX_STROKE_POINTS) return false;
  return value.every(
    (point) =>
      Array.isArray(point) &&
      point.length === 2 &&
      point.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100),
  );
}

export function IsPointList(options?: ValidationOptions): PropertyDecorator {
  return (target: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isPointList',
      target: target.constructor,
      propertyName: propertyName as string,
      options: {
        message: `path must be ${MIN_STROKE_POINTS}-${MAX_STROKE_POINTS} points, each [x, y] with both between 0 and 100`,
        ...options,
      },
      validator: { validate: (value: unknown) => isPointList(value) },
    });
  };
}
