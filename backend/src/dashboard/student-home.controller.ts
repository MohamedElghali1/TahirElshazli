import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import {
  StudentHomeService,
  type StudentHomeResponse,
} from './student-home.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

/**
 * The student Home screen, in one request.
 *
 * Takes no course id and no student id: the student comes from the verified
 * JWT, and the courses come from their own enrollment rows. There is no
 * parameter here that could name somebody else - the same property that makes
 * `POST /courses/:id/enroll` safe (§7.2).
 */
@Controller('dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class StudentHomeController {
  constructor(private readonly studentHomeService: StudentHomeService) {}

  @Get()
  async getHome(
    @Request() req: { user: JwtPayload },
  ): Promise<StudentHomeResponse> {
    return this.studentHomeService.getHome(req.user.sub);
  }
}
