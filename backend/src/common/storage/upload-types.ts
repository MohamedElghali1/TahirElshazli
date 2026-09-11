import type { BlogMediaKind } from '../../blog/interfaces/blog-repository.interface.js';

/**
 * What may be uploaded, and what it is stored as.
 *
 * A **fixed server-side whitelist**, which is CLAUDE.md §8's requirement in one
 * table: *"validate MIME and extension server-side, cap size, never execute
 * uploaded content."* Both halves come from here and neither comes from the
 * request - the extension a file is stored under is looked up by MIME type, so
 * a client cannot name it, and a filename like `../../app.js` has nothing to
 * traverse into because the filename is never used at all.
 *
 * §5.8 makes allowed types *configurable per assignment*. That rule is about
 * student submissions and does not reach here: a teacher's blog gallery is one
 * surface with one audience, and the reason to constrain it is a security one
 * rather than a pedagogical one.
 *
 * Three deliberate omissions, each of which someone will eventually ask for:
 *
 * - **No `image/svg+xml`.** An SVG is a document that can carry `<script>`,
 *   and these files are served from the API's own origin. Allowing it is a
 *   stored-XSS hole against every reader of the blog, and "we only upload
 *   trusted SVGs" is a property of today's uploader, not of the endpoint.
 * - **No `text/html`, and nothing else executable.** Same origin, same reason.
 * - **No `application/zip` or bare `application/octet-stream`.** A container
 *   whose contents cannot be checked is not a validated upload; it is an
 *   unvalidated one with a content type attached.
 */
export interface UploadType {
  /** The extension the file is stored under. No leading dot. */
  extension: string;
  /** How the blog renders it, so the caller does not have to guess from MIME. */
  kind: BlogMediaKind;
}

export const ALLOWED_UPLOAD_TYPES: Readonly<Record<string, UploadType>> = {
  'image/jpeg': { extension: 'jpg', kind: 'image' },
  'image/png': { extension: 'png', kind: 'image' },
  'image/webp': { extension: 'webp', kind: 'image' },
  'image/gif': { extension: 'gif', kind: 'image' },
  'image/avif': { extension: 'avif', kind: 'image' },
  'video/mp4': { extension: 'mp4', kind: 'video' },
  'video/webm': { extension: 'webm', kind: 'video' },
  // QuickTime, because a phone recording of a results morning is what this is
  // actually for and iOS produces .mov.
  'video/quicktime': { extension: 'mov', kind: 'video' },
  'application/pdf': { extension: 'pdf', kind: 'file' },
  'text/plain': { extension: 'txt', kind: 'file' },
};

/**
 * The size ceiling, in bytes.
 *
 * 64 MB, chosen against the one thing this has to hold: a couple of minutes of
 * phone video. Enforced in two places on purpose - multer stops reading at
 * this many bytes so an oversized upload never fully lands in memory, and
 * `UploadsService` re-checks the buffer it was handed, so the limit does not
 * depend on the interceptor having been configured correctly.
 */
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

/** The MIME types the whitelist admits, for an error message worth reading. */
export const ALLOWED_UPLOAD_MIME_TYPES = Object.keys(ALLOWED_UPLOAD_TYPES);

/**
 * The single path prefix the local driver serves from, and the only relative
 * shape `IsBlogMediaUrl` will accept. Both sides import it rather than
 * repeating the string, so tightening the validator cannot silently orphan
 * every file already stored.
 */
export const UPLOAD_URL_PREFIX = '/uploads/';
