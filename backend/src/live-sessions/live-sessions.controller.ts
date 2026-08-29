import { Controller, Get, Param, Request, UseGuards } from '@nestjs/common';
import {
  LiveSessionsService,
  LiveSessionListResponse,
} from './live-sessions.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import type { LiveSession } from './interfaces/live-session-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller('courses/:id/live-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class LiveSessionsController {
  constructor(private readonly liveSessionsService: LiveSessionsService) {}

  @Get()
  async listSessions(
    @Param('id') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSessionListResponse> {
    return this.liveSessionsService.getSessionsForCourse(courseId, req.user.sub);
  }

  @Get('next')
  async getNextSession(
    @Param('id') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<LiveSession | null> {
    return this.liveSessionsService.getNextSession(courseId, req.user.sub);
  }
}
