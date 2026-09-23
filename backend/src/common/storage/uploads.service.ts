import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { FileStorage, StoredFile } from './file-storage.interface.js';
import { FILE_STORAGE } from './file-storage.interface.js';
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  ALLOWED_UPLOAD_TYPES,
  type UploadKind,
  MAX_UPLOAD_BYTES,
} from './upload-types.js';

/**
 * The one thing a multipart upload gives us, typed here rather than imported.
 *
 * `@types/multer` is not a dependency and adding one for two fields is not
 * worth it - `Express.Multer.File` has a dozen members and this code is
 * allowed to touch exactly these three. Narrowing it here also documents the
 * contract: everything else on that object, `originalname` above all, is
 * attacker-controlled and deliberately out of reach.
 */
export interface UploadedFileLike {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface UploadResult extends StoredFile {
  /** What it is, decided from the validated MIME type - see `UploadKind`. */
  kind: UploadKind;
}

/**
 * Validate, then store. In that order, and both server-side (CLAUDE.md §8).
 *
 * Nothing here consults the uploaded filename. The stored name is minted by
 * the driver and its extension comes from the MIME whitelist, so the client
 * contributes bytes and a content type and nothing else - which is what makes
 * path traversal and double-extension tricks non-issues rather than things a
 * sanitiser has to keep catching.
 */
@Injectable()
export class UploadsService {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage | null,
  ) {}

  async store(file: UploadedFileLike | undefined): Promise<UploadResult> {
    if (!this.storage) {
      // STORAGE_DRIVER=none, which is the production default. A 503 and not a
      // 500: the endpoint is understood and correct, the capability is simply
      // not configured, and the UI says so and falls back to the URL field.
      throw new ServiceUnavailableException(
        'File uploads are not configured on this server. Paste a URL instead.',
      );
    }
    if (!file || file.size === 0) {
      throw new BadRequestException('No file was uploaded.');
    }

    // Re-checked against the buffer we actually hold, even though multer is
    // configured with the same ceiling. A limit enforced in one place is a
    // limit that depends on that place having been wired up correctly.
    if (file.buffer.byteLength > MAX_UPLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `That file is larger than the ${Math.floor(
          MAX_UPLOAD_BYTES / (1024 * 1024),
        )} MB limit.`,
      );
    }

    // The browser's Content-Type, which is a claim and not evidence - so it is
    // used only to *look up* an entry in a fixed table. An unrecognised claim
    // is refused, and a recognised one still cannot choose its own extension.
    //
    // Known limitation, stated rather than implied: this does not sniff magic
    // bytes, so a PHP script sent as `image/png` is stored as a .png. That is
    // acceptable here because the file is served as a static asset with
    // `X-Content-Type-Options: nosniff` (helmet, globally) from a server that
    // executes nothing, and because §8's "virus scan where feasible" is the
    // real answer and belongs with R2.
    const type = ALLOWED_UPLOAD_TYPES[file.mimetype.toLowerCase()];
    if (!type) {
      throw new BadRequestException(
        `Files of type "${file.mimetype}" are not accepted. Allowed: ` +
          `${ALLOWED_UPLOAD_MIME_TYPES.join(', ')}.`,
      );
    }

    const stored = await this.storage.save({
      bytes: file.buffer,
      mimeType: file.mimetype.toLowerCase(),
      extension: type.extension,
    });
    return { ...stored, kind: type.kind };
  }

  /**
   * Whether this server accepts uploads at all, so the UI can render a file
   * picker or a URL field rather than offering one that 503s.
   */
  get enabled(): boolean {
    return this.storage !== null;
  }
}
