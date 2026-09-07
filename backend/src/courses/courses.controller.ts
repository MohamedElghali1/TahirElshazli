import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
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
   * Enrolls the *calling* student - the id comes from the verified JWT, never
   * from the request. There is no body and no student parameter, so there is
   * nothing here for a client to substitute another student's id into.
   *
   * 200, not 201: enrolling twice is defined to succeed and return the
   * enrollment that already existed (§5.2 keeps the mode on the enrollment,
   * and a repeat must not reset it), so a created-status code would be a lie
   * on the second call.
   */
  @Post(':id/enroll')
  @HttpCode(HttpStatus.OK)
  async enroll(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<CourseListItem> {
    return this.coursesService.enroll(id, req.user.sub);
  }

  @Get(':id')
  async getCourseDetail(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<CourseDetail> {
    return this.coursesService.getCourseDetail(id, req.user.sub);
  }
}
