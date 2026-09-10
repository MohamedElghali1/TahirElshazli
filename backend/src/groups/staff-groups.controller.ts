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
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { AddGroupMemberDto } from './dto/group.dto.js';
import type { GroupMemberView, GroupSummary } from './groups.service.js';
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
 * **What is scoped here and what is not.** The course-tab read below names a
 * course, so it goes through `StaffScopeService` like every other `/staff`
 * route. The group reads and the placement writes name a *group*, and a group
 * is not a course - it spans them - so there is no course to scope by. That is
 * also what the client asked for directly: *"TAs are allowed to access all
 * groups"* (§5.11.1). If that posture reverses, the check that appears here is
 * "is this TA assigned to a course this group studies", and it belongs in
 * `GroupsService` beside the one `addCourse` already makes.
 *
 * No `@UseGuards`: `JwtAuthGuard` and `RolesGuard` are global in
 * `app.module.ts`, and `RolesGuard` refuses any route with no `@Roles`.
 */
@Controller('staff')
@Roles(Role.Assistant, Role.Teacher)
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
  async get(@Param('groupId') groupId: string): Promise<GroupSummary> {
    return this.groups.get(groupId);
  }

  /** The staff roster: names and emails (§5.17 keeps the student view narrower). */
  @Get('groups/:groupId/members')
  async members(
    @Param('groupId') groupId: string,
  ): Promise<GroupMemberView[]> {
    return this.groups.members(groupId);
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

  @Delete('groups/:groupId/members/:studentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @Param('groupId') groupId: string,
    @Param('studentId') studentId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.groups.removeMember(groupId, studentId, this.actor(req));
  }
}
