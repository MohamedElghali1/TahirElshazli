import { Injectable } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import type { R2Config } from '../config/env.js';
import type { FileStorage, SaveFileInput, StoredFile } from './file-storage.interface.js';
import { UPLOAD_URL_PREFIX } from './upload-types.js';

/**
 * The default a presigned read expires after (`REM-030`, CLAUDE.md §3).
 *
 * Fifteen minutes is generous for a page load and a marking session opening a
 * document, and short enough that a leaked URL (a browser history entry, a
 * referrer header) is worthless soon after.
 */
export const DEFAULT_READ_URL_TTL_SECONDS = 15 * 60;

/** Types the browser should render in place rather than download. */
const INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * Cloudflare R2, reached through its S3-compatible API (`REM-030`).
 *
 * The bucket is **private** (CLAUDE.md §8, D-62): nothing here ever produces a
 * public URL. `save` stores under the same `<uuid>.<ext>` key and returns the
 * same `${UPLOAD_URL_PREFIX}<uuid>.<ext>` *stored* form `LocalDiskStorage`
 * does, so no migration, validator or DB rewrite is needed to introduce this
 * driver (the design this file follows). Only `readUrl` differs: it turns that
 * stored form into a short-lived presigned GET, because a private object is
 * otherwise unreachable from a browser.
 */
@Injectable()
export class R2Storage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly config: R2Config) {
    this.client = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async save(input: SaveFileInput): Promise<StoredFile> {
    // Server-minted, exactly like the local driver - the client contributes
    // bytes and a validated MIME type and nothing that names the object.
    const key = `${randomUUID()}.${input.extension}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: input.bytes,
        ContentType: input.mimeType,
      }),
    );
    return {
      url: `${UPLOAD_URL_PREFIX}${key}`,
      sizeBytes: input.bytes.byteLength,
      mimeType: input.mimeType,
    };
  }

  async remove(url: string): Promise<boolean> {
    if (!url.startsWith(UPLOAD_URL_PREFIX)) {
      // Not ours - an externally-hosted URL on a media row.
      return false;
    }
    const key = url.slice(UPLOAD_URL_PREFIX.length);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }),
      );
      return true;
    } catch {
      // Best-effort, like the local driver: the caller wants the row gone
      // either way, and R2 does not distinguish "deleted" from "was already
      // gone" in a way worth propagating as an error.
      return false;
    }
  }

  async readUrl(
    storedUrl: string,
    ttlSeconds = DEFAULT_READ_URL_TTL_SECONDS,
  ): Promise<string> {
    if (!storedUrl.startsWith(UPLOAD_URL_PREFIX)) {
      // A pasted external link never went through `save` - nothing to sign.
      return storedUrl;
    }
    const key = storedUrl.slice(UPLOAD_URL_PREFIX.length);
    const extension = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
    const mimeType = mimeTypeOfExtension(extension);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        // Inline for what a browser can render on its own (PDF, image);
        // `attachment` for everything else, so a .docx or a plain-text
        // submission downloads instead of the browser trying to display raw
        // bytes as a page.
        ResponseContentDisposition: mimeType && INLINE_MIME_TYPES.has(mimeType)
          ? 'inline'
          : 'attachment',
      }),
      { expiresIn: ttlSeconds },
    );
  }
}

/**
 * The extension a stored key carries maps back to exactly one whitelisted
 * MIME type (`upload-types.ts`'s table is one-to-one on extension), so this is
 * a lookup rather than a guess - the same server-derived fact
 * `storedMimeTypeOf` reads from the local driver's URLs.
 */
function mimeTypeOfExtension(extension: string): string | null {
  const table: Record<string, string> = {
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    pdf: 'application/pdf',
  };
  return table[extension] ?? null;
}
