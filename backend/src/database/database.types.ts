/**
 * Shared helpers for the Postgres repository implementations.
 *
 * Every repository interface in this codebase declares its timestamps as ISO
 * strings, because that is what the in-memory stubs produced and what the API
 * contract the frontend mirrors already depends on. `pg` hands back a JS `Date`
 * for `timestamptz`, so the conversion has to happen in exactly one place or it
 * happens inconsistently in twelve.
 */

/** A `timestamptz` column that the schema declares NOT NULL. */
export function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/** A `timestamptz` column that the schema allows to be NULL. */
export function isoOrNull(value: Date | string | null): string | null {
  return value === null ? null : iso(value);
}

/**
 * `bigint` and `numeric` arrive as strings from `pg` (they can exceed
 * `Number.MAX_SAFE_INTEGER`, so the driver refuses to guess). Every such column
 * in this schema is a file size or a score, comfortably inside the safe range.
 */
export function num(value: string | number): number {
  return typeof value === 'number' ? value : Number(value);
}

export function numOrNull(value: string | number | null): number | null {
  return value === null ? null : num(value);
}
