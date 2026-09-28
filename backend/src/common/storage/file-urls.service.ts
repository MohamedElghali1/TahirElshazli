import { Inject, Injectable } from '@nestjs/common';
import { FILE_STORAGE, type FileStorage } from './file-storage.interface.js';

/**
 * Stored URL → the URL a browser should fetch (`REM-030`).
 *
 * The one place every service that returns an upload-backed field converts
 * it, rather than each calling `FileStorage.readUrl` ad-hoc: object-level
 * authorization is already done by the service returning the field (a student
 * reads only their own submission; staff only within scope; CLAUDE.md §7), so
 * this is purely a URL transform, not a second access check.
 *
 * A no-op end to end when no driver is configured (`STORAGE_DRIVER=none`):
 * there is nothing to sign, and nothing platform-stored could exist yet.
 */
@Injectable()
export class FileUrls {
  constructor(
    @Inject(FILE_STORAGE) private readonly storage: FileStorage | null,
  ) {}

  /** One stored URL, or `null` through untouched (most fields are nullable). */
  async forRead(url: string, ttlSeconds?: number): Promise<string>;
  async forRead(url: string | null, ttlSeconds?: number): Promise<string | null>;
  async forRead(
    url: string | null,
    ttlSeconds?: number,
  ): Promise<string | null> {
    if (url === null || !this.storage) {
      return url;
    }
    return this.storage.readUrl(url, ttlSeconds);
  }

  /**
   * Every URL in one pass, mapping each **distinct** stored URL to exactly one
   * read URL.
   *
   * Needed wherever the same file is named more than once in a single
   * response - a submission's file and the marks drawn on it (`D-42`) both
   * carry `fileUrl`, and the marking UI pairs them by exact string equality
   * (`marked-copy.tsx`). Two independently-presigned URLs for the same R2
   * object carry different signatures and would silently stop matching, so
   * every occurrence of one stored URL resolves through the same in-flight
   * request and the same result.
   */
  async mapping(
    urls: readonly (string | null | undefined)[],
    ttlSeconds?: number,
  ): Promise<Map<string, string>> {
    const unique = [...new Set(urls.filter((u): u is string => !!u))];
    const map = new Map<string, string>();
    if (!this.storage) {
      unique.forEach((u) => map.set(u, u));
      return map;
    }
    const resolved = await Promise.all(
      unique.map((u) => this.storage!.readUrl(u, ttlSeconds)),
    );
    unique.forEach((u, i) => map.set(u, resolved[i]!));
    return map;
  }
}
