import { ValidateIf } from 'class-validator';

/**
 * *Absent means "leave it alone"; `null` is a 400.*
 *
 * `@IsOptional()` skips every other validator when the value is **`null` or
 * `undefined`** - not `undefined` alone
 * (`class-validator/cjs/decorator/common/IsOptional.js`):
 *
 * ```js
 * (object, propertyName) => object[propertyName] !== null && object[propertyName] !== undefined
 * ```
 *
 * On a field that maps to a `NOT NULL` column that is wrong in a way the two
 * drivers disagree about: `PATCH /admin/groups/:id {"name": null}` validated,
 * and then Postgres `COALESCE`d it to a no-op and returned 200 while the memory
 * driver wrote `name = null` (review F2A-2). Neither is the answer; the answer
 * is 400 at the boundary, before either driver sees it.
 *
 * So: **`@IsOptional()` for a field whose column is nullable** - there `null`
 * is a real value meaning "clear it" - **and `@IsOptionalNotNull()` for a field
 * whose column is not.** The name is the whole mechanism: it greps, and it
 * cannot be forgotten per-field the way a repeated `@IsNotEmpty()` can.
 */
export function IsOptionalNotNull(): PropertyDecorator {
  return ValidateIf((_object, value) => value !== undefined);
}
