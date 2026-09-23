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
  UseInterceptors,
  UploadedFile,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RateLimit } from '../common/rate-limit/rate-limit.guard.js';
import { AUTH_ATTEMPT_LIMIT, UPLOAD_LIMIT } from '../common/rate-limit/limits.js';
import { StudentsService } from './students.service.js';
import type { StudentProfileView } from './students.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { Role } from '../auth/roles.enum.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import type { JwtPayload } from '../auth/jwt.strategy.js';
import { ALLOWED_AVATAR_MIME_TYPES, AVATAR_MAX_UPLOAD_BYTES } from '../common/storage/upload-types.js';
import { UploadsService, type UploadedFileLike } from '../common/storage/uploads.service.js';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Student)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly uploadsService: UploadsService,
  ) {}

  @Get('me/profile')
  async getMyProfile(
    @Request() req: { user: JwtPayload },
  ): Promise<StudentProfileView> {
    return this.studentsService.getProfile(req.user.sub);
  }

  @Patch('me/profile')
  async updateMyProfile(
    @Body() dto: UpdateProfileDto,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentProfileView> {
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

  @Post('me/avatar')
  @RateLimit(UPLOAD_LIMIT)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async uploadMyAvatar(
    @UploadedFile() file: UploadedFileLike | undefined,
    @Request() req: { user: JwtPayload },
  ): Promise<StudentProfileView> {
    if (file && !ALLOWED_AVATAR_MIME_TYPES.includes(file.mimetype?.toLowerCase())) {
      throw new UnsupportedMediaTypeException(
        `Files of type "${file.mimetype}" are not accepted. Allowed: ${ALLOWED_AVATAR_MIME_TYPES.join(', ')}.`,
      );
    }
    const result = await this.uploadsService.store(file, {
      maxBytes: AVATAR_MAX_UPLOAD_BYTES,
      allowedMimeTypes: ALLOWED_AVATAR_MIME_TYPES,
    });
    return this.studentsService.updateProfile(req.user.sub, { avatarUrl: result.url });
  }
}
