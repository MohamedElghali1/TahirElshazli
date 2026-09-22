import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import {
  CoursesService,
  CatalogItem,
  CourseListItem,
  CourseDetail,
} from './courses.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller('courses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get()
  async listCourses(
    @Request() req: { user: JwtPayload },
  ): Promise<CourseListItem[]> {
    return this.coursesService.getEnrolledCourses(req.user.sub);
  }

  /**
   * Declared before `@Get(':id')`. Nest matches routes in declaration order,
   * so the reverse would hand 'catalog' to the detail route as a course id and
   * answer 404 for the catalog itself.
   */
  @Get('catalog')
  async listCatalog(
    @Request() req: { user: JwtPayload },
  ): Promise<CatalogItem[]> {
    return this.coursesService.getCatalog(req.user.sub);
  }

  /**
   * **`POST /:id/enroll` is retired** (`DOM-4`, `PRODUCT_SPEC.md:41-49`).
   *
   * A student no longer enrols themselves. Enrolment is a consequence of staff
   * accepting a registration - `POST /admin/students/:studentId/accept` - and
   * the account is `waiting` until they do, so there is no signed-in student
   * for whom self-enrolment was ever reachable.
   *
   * `CoursesService.enroll` stays and is called from there. Only the route is
   * gone, and it now answers 404 like any other path that does not exist; an
   * e2e case asserts that.
   */

  @Get(':id')
  async getCourseDetail(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<CourseDetail> {
    return this.coursesService.getCourseDetail(id, req.user.sub);
  }
}
