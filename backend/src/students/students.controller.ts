import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import { AUTH_ATTEMPT_LIMIT } from '../common/rate-limit/limits.js';
import { StudentsService } from './students.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import type { StudentProfile } from './interfaces/student-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Get('me/profile')
  async getMyProfile(
    @Request() req: { user: JwtPayload },
  ): Promise<StudentProfile> {
    return this.studentsService.getProfile(req.user.sub);
  }

  @Patch('me/profile')
  async updateMyProfile(
    @Body() dto: UpdateProfileDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentProfile> {
    return this.studentsService.updateProfile(req.user.sub, dto);
  }

  // Verifies the current password, so it is a credential oracle for anyone who
  // has stolen a token and wants to confirm the password before using it.
  @Post('me/password')
  @RateLimit(AUTH_ATTEMPT_LIMIT)
  @HttpCode(HttpStatus.OK)
  async changeMyPassword(
    @Body() dto: ChangePasswordDto,
    @Request() req: { user: JwtPayload },
  ): Promise<{ success: true }> {
    return this.studentsService.changePassword(
      req.user.sub,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}
