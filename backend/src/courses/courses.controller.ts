import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { CourseListItem, CourseDetail } from './interfaces/course-repository.interface.js';
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

  @Get(':id')
  async getCourseDetail(
    @Param('id') id: string,
    @Request() req: { user: JwtPayload },
  ): Promise<CourseDetail> {
    return this.coursesService.getCourseDetail(id, req.user.sub);
  }
}
