import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ADMIN, STAFF_ALL } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { AddGroupMemberDto } from './dto/group.dto.js';
import type { GroupMemberView, GroupReport, GroupSummary } from './groups.service.js';
import { GroupsService } from './groups.service.js';

/**
 * `/staff/*` - shared by TA and admin, matching `StaffManageController` and
 * `StaffAnnouncementsController`.
 *
 * **Placement is on this controller and not the admin one, and that is a client
 * decision.** CLAUDE.md §5.16, answered 2026-09-10: a student is assigned to a
 * group *"by the assistant or the teacher"*. §2.2 records why that is not the
 * same as widening enrollment - placement decides which cohort a student sits
 * in among people who already hold the course; enrolling and unenrolling remain
 * teacher-only.
 *
 * **Every route here is scoped.** The course-tab read names a course and goes
 * through `StaffScopeService.assertAssigned`; the group reads and the placement
 * write name a *group* and go through `GroupsService.requireGroup`, which asks
 * `StaffScopeService.mayReachGroup`. An assistant whose scope is
 * `assigned_groups` gets a **404 with the byte-identical message** on a group
 * they do not hold - reads included.
 *
 * That closes **decision `D-10`** (2026-09-20), built by `AUTH-2` in unit 2
 * slice 2b-ii. Until then these three routes were unscoped: any assistant could
 * fetch any group and its roster, every member's name and email included. It
 * had been argued from "a group spans courses, so there is no course to scope
 * by"; migration `013` made every group study exactly one course, which killed
 * the premise, and `AUTHORIZATION_MODEL.md:105,207` had said so all along.
 *
 * The check is in `GroupsService`, not here - one chokepoint every group read
 * and write already passes through, so a route added later cannot forget it.
 *
 * No `@UseGuards`: `JwtAuthGuard` and `RolesGuard` are global in
 * `app.module.ts`, and `RolesGuard` refuses any route with no `@Roles`.
 */
@Controller('staff')
@Roles(...STAFF_ALL)
export class StaffGroupsController {
  constructor(private readonly groups: GroupsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  /** Which groups study this course. Scoped - the path names a course. */
  @Get('courses/:courseId/groups')
  async listForCourse(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<GroupSummary[]> {
    return this.groups.listForCourse(courseId, this.actor(req));
  }

  @Get('groups/:groupId')
  async get(
    @Param('groupId') groupId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<GroupSummary> {
    return this.groups.get(groupId, this.actor(req));
  }

  /** The staff roster: names and emails (§5.17 keeps the student view narrower). */
  @Get('groups/:groupId/members')
  async members(
    @Param('groupId') groupId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<GroupMemberView[]> {
    return this.groups.members(groupId, this.actor(req));
  }

  /** Stats plus a per-student table (`GROUP-4`). Scoped like every other group read. */
  @Get('groups/:groupId/report')
  async report(
    @Param('groupId') groupId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<GroupReport> {
    return this.groups.report(groupId, this.actor(req));
  }

  /**
   * Place a student in this group.
   *
   * 201 rather than 200, and idempotent: placing someone already in the group
   * returns success rather than a conflict, the same contract
   * `EnrollmentRepository.create` has and for the same reason - two clicks on
   * Add describe one true state.
   */
  @Post('groups/:groupId/members')
  @HttpCode(HttpStatus.CREATED)
  async addMember(
    @Param('groupId') groupId: string,
    @Body() body: AddGroupMemberDto,
    @Request() req: { user: JwtPayload },
  ): Promise<{ ok: true }> {
    await this.groups.addMember(groupId, body.studentId, this.actor(req));
    return { ok: true };
  }

  /**
   * **Teacher and admin only** (`AUTH-3`, `API_SPEC.yaml:713-727`), which is a
   * narrowing of shipped behaviour: this route was TA-reachable through the
   * class-level `@Roles`.
   *
   * A **method-level** override rather than a move to `AdminGroupsController`,
   * because the path stays `/staff/groups/…` in the contract and moving the
   * handler would change the URL. `RolesGuard` reads
   * `getAllAndOverride(ROLES_KEY, [handler, class])` (`roles.guard.ts:62-65`),
   * so handler metadata wins over the class's.
   *
   * **403, not 404.** The assistant is looking at the roster - they can see the
   * group and the student - so it is the verb that is refused, not the
   * resource's existence. `GroupsService.removeMember` refuses again with the
   * same status regardless of what reaches it.
   */
  @Delete('groups/:groupId/members/:studentId')
  @Roles(...STAFF_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('groupId') groupId: string,
    @Param('studentId') studentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.groups.removeMember(groupId, studentId, this.actor(req));
  }
}
