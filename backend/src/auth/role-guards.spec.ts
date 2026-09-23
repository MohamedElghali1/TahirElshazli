import { describe, expect, it } from 'vitest';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import { ROLES_KEY } from './roles.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { ANY_ROLE_KEY } from './any-role.decorator.js';
import { Role } from './roles.enum.js';
import { STAFF_ADMIN, STAFF_ALL } from './staff-roles.js';

/**
 * The authorization boundary, asserted by enumeration rather than by review.
 *
 * **Why this file exists.** Adding a member to `Role` produces **zero compile
 * errors** anywhere in either workspace - there is no `Record<Role, …>` and no
 * `switch` on a role value - so the compiler applied no pressure at all to the
 * 14 `@Roles` sites that had to widen for `Role.Admin`. Two mistakes were
 * available, and they are not symmetric:
 *
 *   - a **missed** widening is loud: an admin gets 403 on a route they should
 *     reach, and someone notices within a minute;
 *   - an **over**-widening is **silent**. `Role.Assistant` reaching `/admin/*`
 *     looks like nothing at all, and it is the exact hole `SECURITY.md` §2.7
 *     names.
 *
 * So the boundary is enumerated here once, as a table, read back off the
 * decorators with `Reflect.getMetadata`. This is the same device as the
 * exhaustive `Record<AuditAction, true>` in `list-audit-log-query.dto.ts` one
 * layer up: it turns a checklist somebody has to remember to run into a build
 * failure.
 *
 * Controllers are discovered with `import.meta.glob`, deliberately, rather than
 * listed. A hand-written list can only prove that the controllers someone
 * thought of are decorated - never that a new one is. The count assertion is
 * what makes an added controller land here rather than slip past.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * `import.meta.glob` is Vite's, and vitest runs on Vite. It is typed here
 * locally rather than by adding `vite/client` to the backend's `tsconfig.json`:
 * this is a Nest service, not a Vite application, and widening the whole
 * workspace's ambient types for one spec file is a larger change than the spec
 * is worth.
 */
interface ViteImportMeta {
  glob<T>(pattern: string, options: { eager: true }): Record<string, T>;
}

const modules = (import.meta as unknown as ViteImportMeta).glob<
  Record<string, unknown>
>('../**/*.controller.ts', { eager: true });

interface DiscoveredController {
  name: string;
  cls: any;
  /** The `@Controller('…')` path. */
  path: string;
}

const CONTROLLERS: DiscoveredController[] = Object.values(modules)
  .flatMap((mod) =>
    Object.values(mod)
      .filter(
        (exported): exported is any =>
          typeof exported === 'function' &&
          Reflect.getMetadata(PATH_METADATA, exported) !== undefined,
      )
      .map((cls) => ({
        name: cls.name as string,
        cls,
        path: String(Reflect.getMetadata(PATH_METADATA, cls) ?? ''),
      })),
  )
  .sort((a, b) => a.name.localeCompare(b.name));

/** Every route handler on a controller. */
function handlersOf(entry: DiscoveredController): { method: string; fn: any }[] {
  const proto = entry.cls.prototype;
  return Object.getOwnPropertyNames(proto)
    .filter((key) => key !== 'constructor')
    .map((key) => ({ method: key, fn: proto[key] }))
    .filter(
      ({ fn }) =>
        typeof fn === 'function' &&
        Reflect.getMetadata(METHOD_METADATA, fn) !== undefined,
    );
}

/**
 * The guard's own resolution, reproduced: `getAllAndOverride(KEY, [handler,
 * class])` takes the first *defined* value, so handler metadata overrides class
 * metadata (`roles.guard.ts:62-65`). Asserting anything else would test a
 * boundary the runtime does not enforce.
 */
function resolve<T>(key: string, cls: any, fn: any): T | undefined {
  const onHandler = Reflect.getMetadata(key, fn) as T | undefined;
  return onHandler !== undefined
    ? onHandler
    : (Reflect.getMetadata(key, cls) as T | undefined);
}

const EXPECTED: Record<string, readonly Role[]> = {
  // ---- /admin/* : teacher and admin, unscoped. NEVER an assistant. ----
  AdminAnnouncementsController: STAFF_ADMIN,
  AdminAuditController: STAFF_ADMIN,
  AdminGoogleIntegrationController: STAFF_ADMIN,
  AdminCoursesController: STAFF_ADMIN,
  AdminGroupsController: STAFF_ADMIN,
  AdminManageController: STAFF_ADMIN,

  // ---- /staff/* : every staff role, scoped by StaffScopeService ----
  StaffAnnouncementsController: STAFF_ALL,
  StaffBlogController: STAFF_ALL,
  StaffGroupsController: STAFF_ALL,
  StaffManageController: STAFF_ALL,
  StaffController: STAFF_ALL,
  // The draft library (`TASK-2`, unit 6). Assistant-reachable by
  // `AUTHORIZATION_MODEL.md` §3; scoped by course reach in the service.
  TaskDraftsController: STAFF_ALL,
  UploadsController: STAFF_ALL,
  WorkAnalyticsController: STAFF_ALL,
  SettingsController: STAFF_ALL,

  // ---- the student surface: a student never becomes an admin ----
  AssessmentsController: [Role.Student],
  ClassmatesController: [Role.Student],
  CoursesController: [Role.Student],
  DashboardController: [Role.Student],
  LiveSessionsController: [Role.Student],
  MaterialsController: [Role.Student],
  RecordingsController: [Role.Student],
  ReportsController: [Role.Student],
  StudentAnnouncementsController: [Role.Student],
  StudentHomeController: [Role.Student],
  StudentsController: [Role.Student],

  // ---- the one mixed audience: recipients, of any kind ----
  NotificationsController: [Role.Student, ...STAFF_ALL],
};

/** Controllers that are anonymous by design, and the only ones. */
const PUBLIC_CONTROLLERS = ['PublicBlogController', 'PublicCoursesController'];

/** Controllers that decorate per method rather than per class. */
const PER_METHOD_CONTROLLERS = ['AppController', 'AuthController'];

describe('the authorization boundary', () => {
  it('discovers every controller in the build', () => {
    // 30 controller files, 30 classes. If this number moves, a controller was
    // added or removed and its row below has to be decided rather than
    // defaulted - which is the entire point of asserting a count.
    // `AdminCoursesController` (`DOM-5`) was the thirtieth; `AdminStaffController`
    // left with `course_staff_assignments` (`AUTH-2`), which is a net -1.
    // `TaskDraftsController` (`TASK-2`, unit 6) is the thirtieth again.
    expect(CONTROLLERS).toHaveLength(31);
    const named = CONTROLLERS.map((c) => c.name);
    expect(new Set(named).size).toBe(named.length);
    const accounted = [
      ...Object.keys(EXPECTED),
      ...PUBLIC_CONTROLLERS,
      ...PER_METHOD_CONTROLLERS,
    ];
    for (const name of accounted) {
      expect(named).toContain(name);
    }
    for (const name of named) {
      expect(accounted).toContain(name);
    }
    expect(Object.keys(EXPECTED)).toHaveLength(27);
  });

  describe('@Roles, read back off the decorator', () => {
    it.each(Object.keys(EXPECTED))(
      '%s carries exactly its expected roles',
      (name) => {
        const entry = CONTROLLERS.find((c) => c.name === name);
        expect(entry, `${name} was not discovered`).toBeDefined();
        const roles = Reflect.getMetadata(ROLES_KEY, entry!.cls) as
          | Role[]
          | undefined;
        // Order-insensitive, value-exact: `@Roles(...STAFF_ALL)` spreads in
        // declaration order and nothing should depend on that, but no role may
        // be present that is not expected and none absent that is.
        expect([...(roles ?? [])].sort()).toEqual([...EXPECTED[name]].sort());
      },
    );
  });

  describe('the /admin/* boundary', () => {
    it('STAFF_ADMIN is the teacher and the admin, and nothing else', () => {
      // The single assertion that makes the silent failure loud.
      expect(STAFF_ADMIN).not.toContain(Role.Assistant);
      expect(STAFF_ADMIN).not.toContain(Role.Student);
      expect(STAFF_ADMIN).not.toContain(Role.Parent);
      expect(STAFF_ADMIN).not.toContain(Role.Visitor);
      expect([...STAFF_ADMIN].sort()).toEqual(
        [Role.Admin, Role.Teacher].sort(),
      );
    });

    it('STAFF_ALL adds the assistant and nothing beyond the three staff roles', () => {
      expect([...STAFF_ALL].sort()).toEqual(
        [Role.Assistant, Role.Teacher, Role.Admin].sort(),
      );
      expect(STAFF_ALL).not.toContain(Role.Student);
      expect(STAFF_ALL).not.toContain(Role.Parent);
      expect(STAFF_ALL).not.toContain(Role.Visitor);
    });

    it('no route under admin/ admits an assistant, student, parent or visitor', () => {
      const adminControllers = CONTROLLERS.filter((c) =>
        c.path.startsWith('admin'),
      );
      // Six today - `AdminCoursesController` joined for `DOM-5` and
      // `AdminStaffController` left with `AUTH-2`. Asserted so a seventh admin
      // controller cannot arrive without this test looking at it.
      expect(adminControllers).toHaveLength(6);
      for (const entry of adminControllers) {
        // Per **handler**, through `resolve()` - the guard's own precedence -
        // and not off the class. A method-level `@Roles(...STAFF_ALL)` on a
        // single `/admin/*` handler, the same override
        // `staff-groups.controller.ts:109` uses legitimately in the *narrowing*
        // direction, leaves class metadata untouched. `RolesGuard` honours it
        // (`getAllAndOverride`), so a test that read the class alone would call
        // an assistant on `/admin/*` green - the silent half of the pair this
        // file exists for.
        const handlers = handlersOf(entry);
        expect(
          handlers.length,
          `${entry.name} exposes no route`,
        ).toBeGreaterThan(0);
        for (const { method, fn } of handlers) {
          const roles = resolve<Role[]>(ROLES_KEY, entry.cls, fn) ?? [];
          expect(
            roles.length,
            `${entry.name}.${method} declares no @Roles`,
          ).toBeGreaterThan(0);
          for (const forbidden of [
            Role.Assistant,
            Role.Student,
            Role.Parent,
            Role.Visitor,
          ]) {
            expect(
              roles,
              `${entry.name}.${method} (${entry.path}) admits ${forbidden}`,
            ).not.toContain(forbidden);
          }
        }
      }
    });

    it('nothing but an Admin* controller is mounted on an admin path', () => {
      for (const entry of CONTROLLERS) {
        if (!entry.path.startsWith('admin')) continue;
        expect(entry.name).toMatch(/^Admin/);
      }
    });
  });

  describe('every route handler reaches a decided verdict', () => {
    it('no handler relies on the fail-closed 403 to hide it', () => {
      // `RolesGuard` refuses a route with no `@Roles` rather than admitting it
      // (`roles.guard.ts:62-73`), which is the right default and a bad thing to
      // rely on: the route is then unreachable and nobody finds out until a
      // user does. Assert the decision is always explicit.
      const undecided: string[] = [];
      for (const entry of CONTROLLERS) {
        for (const { method, fn } of handlersOf(entry)) {
          const isPublic = resolve<boolean>(IS_PUBLIC_KEY, entry.cls, fn);
          const anyRole = resolve<boolean>(ANY_ROLE_KEY, entry.cls, fn);
          const roles = resolve<Role[]>(ROLES_KEY, entry.cls, fn);
          if (!isPublic && !anyRole && !(roles && roles.length > 0)) {
            undecided.push(`${entry.name}.${method}`);
          }
        }
      }
      expect(undecided).toEqual([]);
    });

    it('the anonymous surface is exactly the routes meant to be anonymous', () => {
      // Pinned, because adding a `@Public()` route is a security decision
      // (CLAUDE.md §7) and must not be reviewable only as a one-line diff.
      const publicRoutes: string[] = [];
      for (const entry of CONTROLLERS) {
        for (const { method, fn } of handlersOf(entry)) {
          if (resolve<boolean>(IS_PUBLIC_KEY, entry.cls, fn)) {
            publicRoutes.push(`${entry.name}.${method}`);
          }
        }
      }
      expect(publicRoutes.sort()).toEqual(
        [
          // The health check.
          'AppController.getHealth',
          // Registration, login, and the password-reset pair.
          'AuthController.register',
          'AuthController.login',
          'AuthController.requestPasswordReset',
          'AuthController.confirmPasswordReset',
          // The assistant-invitation accept (`AUTH-4`). Unauthenticated for
          // the same reason password-reset confirm is: the token IS the
          // credential proving the invite was theirs.
          'AuthController.acceptInvitation',
          // Google's top-level browser redirect back, which carries no
          // Authorization header. Its own signed-state check is the gate.
          'AdminGoogleIntegrationController.callback',
          // The anonymous marketing surface, `@Public()` at class level.
          'PublicBlogController.list',
          'PublicBlogController.get',
          'PublicCoursesController.listCourses',
          'PublicCoursesController.getCourse',
        ].sort(),
      );
    });

    it('@AnyRole() is used only for logout', () => {
      const anyRoleRoutes: string[] = [];
      for (const entry of CONTROLLERS) {
        for (const { method, fn } of handlersOf(entry)) {
          if (resolve<boolean>(ANY_ROLE_KEY, entry.cls, fn)) {
            anyRoleRoutes.push(`${entry.name}.${method}`);
          }
        }
      }
      expect(anyRoleRoutes).toEqual(['AuthController.logout']);
    });

    it('only the DELETE handlers that should admit an assistant do', () => {
      // A narrower net for the destructive verb. AUTH-3 moves the group-member
      // removal to teacher/admin, so a DELETE that admits an assistant should
      // be something this test lists rather than something a reader hunts for.
      const assistantDeletes: string[] = [];
      for (const entry of CONTROLLERS) {
        for (const { method, fn } of handlersOf(entry)) {
          if (
            Reflect.getMetadata(METHOD_METADATA, fn) !== RequestMethod.DELETE
          ) {
            continue;
          }
          const roles = resolve<Role[]>(ROLES_KEY, entry.cls, fn) ?? [];
          if (roles.includes(Role.Assistant)) {
            assistantDeletes.push(`${entry.name}.${method}`);
          }
        }
      }
      // An assistant may still delete a blog post they wrote - the service
      // narrows that to authorship (`blog.service.ts` `assertMayMutate`) - and
      // may delete a task. They may not remove a person from a group: that is
      // AUTH-3's narrowing, and `StaffGroupsController.removeMember` was in
      // this list before it. They may delete any draft in the library on a
      // course they reach - `AUTHORIZATION_MODEL.md` §3 grants "Manage the
      // draft library" with no own-only rule (unit 6, `TASK-2`).
      expect(assistantDeletes.sort()).toEqual(
        [
          'StaffBlogController.remove',
          'StaffManageController.deleteAssessment',
          'TaskDraftsController.remove',
        ].sort(),
      );
    });
  });
});
