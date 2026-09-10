import { Controller, Get, Param, Request } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import type { ClassmateGroup } from './classmates.service.js';
import { ClassmatesService } from './classmates.service.js';

/**
 * The student's classmate list (CLAUDE.md §5.17).
 *
 * `@Controller()` with the path on the method, matching
 * `RecordingsController` - the route is course-scoped but the resource is not
 * a course, so a `courses` prefix on the class would misname it.
 *
 * The student id comes from the verified JWT and there is no parameter or body
 * that could name a different one, which is the same property
 * `POST /courses/:id/enroll` has (§7.2). A student can only ever ask about
 * their own classmates.
 */
@Controller()
@Roles(Role.Student)
export class ClassmatesController {
  constructor(private readonly classmates: ClassmatesService) {}

  /**
   * One entry per group the caller sits in that studies this course - two
   * groups means two lists, never a merged one (§5.17).
   *
   * An empty array is the normal answer for a student who is enrolled but not
   * yet placed (§7.2), not an error. The frontend should say "you have not been
   * added to a group yet" rather than "no classmates".
   */
  @Get('courses/:courseId/classmates')
  async list(
    @Param('courseId') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<ClassmateGroup[]> {
    return this.classmates.forCourse(courseId, req.user.sub);
  }
}
