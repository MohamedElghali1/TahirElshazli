import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RecordingsService, RecordingListResponse } from './recordings.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { UpdateProgressDto } from './dto/update-progress.dto.js';
import { ListRecordingsQueryDto } from './dto/list-recordings-query.dto.js';
import type { RecordingProgress } from './interfaces/recording-repository.interface.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class RecordingsController {
  constructor(private readonly recordingsService: RecordingsService) {}

  @Get('courses/:id/recordings')
  async listRecordings(
    @Param('id') courseId: string,
    @Query() query: ListRecordingsQueryDto,
    @Request() req: { user: JwtPayload },
  ): Promise<RecordingListResponse> {
    return this.recordingsService.getRecordingsForCourse(courseId, req.user.sub, {
      chapter: query.chapter,
      topic: query.topic,
    });
  }

  @Post('recordings/:id/progress')
  @HttpCode(HttpStatus.OK)
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
