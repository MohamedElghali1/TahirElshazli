import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import { DashboardService, DashboardResponse } from './dashboard.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller('courses/:id/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  async getDashboard(
    @Param('id') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<DashboardResponse> {
    return this.dashboardService.getDashboard(courseId, req.user.sub);
  }
}
