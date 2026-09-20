import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../auth/roles.decorator.js';
import { STAFF_ALL } from '../../auth/staff-roles.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { UPLOAD_LIMIT } from '../rate-limit/limits.js';
import { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_MIME_TYPES } from './upload-types.js';
import {
  UploadsService,
  type UploadedFileLike,
  type UploadResult,
} from './uploads.service.js';

/**
 * `POST /staff/uploads` - bytes in, a URL out.
 *
 * Deliberately generic and deliberately **not** under `/staff/blog`. The blog
 * is the first thing to need it (CLAUDE.md §5.19), but materials, recordings
 * and annotated submissions all currently take a URL string and all want the
 * same endpoint, so it is one route rather than one per feature. What it
 * emphatically does not do is attach anything to anything: it stores a file
 * and hands back where it went. Whether that URL becomes a blog gallery item
 * is a second, separate, audited call.
 *
 * On `/staff/*` and reachable by an assistant, because the client's
 * instruction on 2026-09-10 named both actors - *"the teacher, or ta can
 * upload data"*. There is no `StaffScopeService` check here and nothing to
 * make one out of: an upload names no course.
 *
 * The rate limit matters more here than on a JSON route. Every call writes to
 * disk, so without one an authenticated TA could fill the volume; 30/minute is
 * loose enough for a gallery of certificates and tight enough that filling a
 * disk takes deliberate effort rather than one loop.
 */
@Controller('staff')
@Roles(...STAFF_ALL)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  /**
   * What this server will accept, so the authoring form can render a file
   * picker or fall back to the URL field rather than offering an upload that
   * 503s (STORAGE_DRIVER=none is the production default).
   */
  @Get('uploads/config')
  config(): {
    enabled: boolean;
    maxBytes: number;
    allowedMimeTypes: readonly string[];
  } {
    return {
      enabled: this.uploads.enabled,
      maxBytes: MAX_UPLOAD_BYTES,
      allowedMimeTypes: ALLOWED_UPLOAD_MIME_TYPES,
    };
  }

  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(UPLOAD_LIMIT)
  // Memory storage, and no `dest`: multer must never write the file itself.
  // With a destination it lands on disk under a name multer chooses before any
  // of our validation has run, and rejecting it afterwards leaves the file
  // there. Buffered, the whitelist decides *before* anything is written.
  //
  // `limits.fileSize` makes multer stop reading at the ceiling rather than
  // buffering an arbitrarily large body first; `UploadsService` re-checks what
  // it was handed, so neither place is the only one enforcing it.
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async upload(
    @UploadedFile() file: UploadedFileLike | undefined,
  ): Promise<UploadResult> {
    return this.uploads.store(file);
  }
}
