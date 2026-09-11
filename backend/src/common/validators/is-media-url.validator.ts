import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { isPublicHttpUrl } from './is-public-http-url.validator.js';
import { UPLOAD_URL_PREFIX } from '../storage/upload-types.js';

/**
 * A file name this server could plausibly have minted.
 *
 * `LocalDiskStorage` produces `<uuid>.<ext>` and nothing else, so the character
 * class is generous only by a little. What matters is what it excludes: no
 * slash, so nothing can address a subdirectory, and no `.` sequence that could
 * climb - `..` is rejected outright below rather than relied on being
 * unmatchable here.
 */
const UPLOAD_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/;

/**
 * Whether a value is somewhere media may legitimately live.
 *
 * Two shapes, and the second is why this exists rather than reusing
 * `isPublicHttpUrl` alone:
 *
 *  1. **A public http(s) URL** - media hosted on a CDN, Bunny Stream, or
 *     anywhere else. Delegated to `isPublicHttpUrl`, which is the one place
 *     that decides what "public host" means and which already rejects
 *     `javascript:`, `data:`, loopback and cloud-metadata addresses.
 *  2. **A root-relative `/uploads/<name>`** - a file this server stored itself
 *     through `POST /staff/uploads`. Necessary because that URL has no host in
 *     it and never should: hardcoding one would break the moment the API moves
 *     behind a different domain, and in development it would be `localhost`,
 *     which `isPublicHttpUrl` correctly refuses.
 *
 * Note what case 2 deliberately is *not*: a general permission to submit
 * relative paths. `/etc/passwd`, `/api/admin/students` and `/uploads/../.env`
 * are all rejected. Only the exact prefix the storage driver writes under, plus
 * one path segment, is accepted - which keeps the set of accepted relative URLs
 * equal to the set of files we ourselves created.
 */
export function isMediaUrl(value: unknown): boolean {
  if (typeof value !== 'string') {
    return false;
  }
  if (value.startsWith(UPLOAD_URL_PREFIX)) {
    const name = value.slice(UPLOAD_URL_PREFIX.length);
    // Checked before the pattern, and separately, because a rejection for
    // traversal is worth being unambiguous about even though the pattern would
    // also refuse it.
    if (name.includes('/') || name.includes('..')) {
      return false;
    }
    return UPLOAD_NAME.test(name);
  }
  return isPublicHttpUrl(value);
}

/**
 * Rejects media URLs that are neither a public http(s) address nor a file this
 * server stored itself (CLAUDE.md §8).
 *
 * Inherits `isPublicHttpUrl`'s documented gap for case 1: a hostname that
 * *resolves* privately still passes, because catching that needs DNS at
 * validation time. The gap narrows every time an author uses the upload button
 * instead of pasting a URL, which is the whole reason the upload path was built
 * alongside this.
 */
export function IsMediaUrl(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMediaUrl',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (value: unknown) => isMediaUrl(value),
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be an http(s) URL on a public host, or an ` +
          `uploaded file path beginning ${UPLOAD_URL_PREFIX}`,
      },
    });
  };
}
