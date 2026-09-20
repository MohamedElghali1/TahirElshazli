import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { STAFF_ADMIN } from '../auth/staff-roles.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import {
  AddGroupCourseDto,
  CreateGroupDto,
  ListGroupsQueryDto,
  RenameGroupDto,
} from './dto/group.dto.js';
import {
  DEFAULT_GROUP_PAGE_SIZE,
  GroupsService,
} from './groups.service.js';
import type { GroupSummary } from './groups.service.js';
import type {
  Group,
  GroupCourse,
} from './interfaces/group-repository.interface.js';

/**
 * `/admin/*` - teacher only, unscoped, matching `AdminManageController`.
 *
 * The split against `StaffGroupsController` follows the shape §2.2 already
 * uses. **Creating and renaming a group, and deciding what it studies, are
 * teacher powers**; **placing students into it is a TA power** and lives on the
 * staff controller. The client's instruction covered placement explicitly
 * (*"the assistants and teachers can add to specific group"*) and said nothing
 * about who creates a group, so the narrow reading ships - the same call made
 * for live-session scheduling on 2026-09-07 (§11), and reversible the same way:
 * these routes move to the staff controller and `GroupsService` is untouched,
 * because it already takes a `StaffActor` and derives `actorRole` from it
 * rather than assuming the teacher.
 */
@Controller('admin')
@Roles(...STAFF_ADMIN)
export class AdminGroupsController {
  constructor(private readonly groups: GroupsService) {}

  private actor(req: { user: JwtPayload }) {
    return { id: req.user.sub, role: req.user.role };
  }

  @Get('groups')
  async list(@Query() query: ListGroupsQueryDto): Promise<GroupSummary[]> {
    return this.groups.list(
      query.limit ?? DEFAULT_GROUP_PAGE_SIZE,
      query.offset ?? 0,
    );
  }

  @Get('groups/:groupId')
  async get(@Param('groupId') groupId: string): Promise<GroupSummary> {
    return this.groups.get(groupId);
  }

  @Post('groups')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() body: CreateGroupDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Group> {
    return this.groups.create(this.actor(req), body.name);
  }

  @Patch('groups/:groupId')
  async rename(
    @Param('groupId') groupId: string,
    @Body() body: RenameGroupDto,
    @Request() req: { user: JwtPayload },
  ): Promise<Group> {
    return this.groups.rename(groupId, this.actor(req), body.name);
  }

  /**
   * Enroll this group in a course - the client's verb (§5.16).
   *
   * It enrolls **no students**: `Enrollment` stays the access gate and adding a
   * group to a course grants nobody anything. That was the answer on
   * 2026-09-10 (*"not necessary"*), and it is what keeps the payment question
   * (§5.12) out of this surface.
   */
  @Post('groups/:groupId/courses')
  @HttpCode(HttpStatus.CREATED)
  async addCourse(
    @Param('groupId') groupId: string,
    @Body() body: AddGroupCourseDto,
    @Request() req: { user: JwtPayload },
  ): Promise<GroupCourse> {
    return this.groups.addCourse(
      groupId,
      body.courseId,
      this.actor(req),
      body.learningMode,
    );
  }

  @Delete('groups/:groupId/courses/:courseId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeCourse(
    @Param('groupId') groupId: string,
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<void> {
    await this.groups.removeCourse(groupId, courseId, this.actor(req));
  }
}
