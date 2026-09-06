/**
 * DI token for the `pg` connection pool, or `null` when the process is running
 * on the in-memory repositories. Kept in its own module so
 * `database.service.ts` and `database.module.ts` do not import each other.
 */
export const DATABASE_POOL = Symbol('DATABASE_POOL');
