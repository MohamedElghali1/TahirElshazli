import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import { StudentsService } from './students.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { StudentProfile } from './interfaces/student-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me/profile')
  @Roles(Role.Student)
  async getMyProfile(
    @Request() req: { user: JwtPayload },
  ): Promise<StudentProfile> {
    return this.studentsService.getProfile(req.user.sub);
  }
}
