import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { RecordingsService } from './recordings.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { UpdateProgressDto } from './dto/update-progress.dto.js';
import type { RecordingWithProgress, RecordingProgress } from './interfaces/recording-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get('courses/:id/recordings')
  async listRecordings(
    @Param('id') courseId: string,
    @Request() req: { user: JwtPayload },
  ): Promise<RecordingWithProgress[]> {
    return this.recordingsService.getRecordingsForCourse(courseId, req.user.sub);
  }

  @Post('recordings/:id/progress')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateProgress(
    @Param('id') recordingId: string,
    @Body() dto: UpdateProgressDto,
    @Request() req: { user: JwtPayload },
  ): Promise<RecordingProgress> {
    return this.recordingsService.updateProgress(
      recordingId,
      req.user.sub,
      dto.watchedSeconds,
    );
  }
}
