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
 * rather than a pedagogical one. The same table serves task attachments
 * (unit 6), which is why it carries audio and why `kind` is not the blog's.
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
/**
 * What kind of thing an upload is, decided from the validated MIME type.
 *
 * **Its own vocabulary, not the blog's** (`D-29`, unit 6). It used to be typed
 * `BlogMediaKind`, which made the storage layer speak one consumer's language:
 * task attachments needed audio, and the blog has no audio kind. A consumer
 * maps this onto its own kinds and refuses what it cannot render - the blog
 * editor refuses `audio` rather than posting it to a DTO that would 400.
 */
export type UploadKind = 'image' | 'video' | 'audio' | 'file';

export interface UploadType {
  /** The extension the file is stored under. No leading dot. */
  extension: string;
  /** What it is, so the caller does not have to guess from MIME. */
  kind: UploadKind;
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
  // Listening tasks (`D-29`): a recording attached to a task. Both are
  // non-executable containers served with nosniff. `audio/mp4` is the .m4a an
  // iPhone voice memo produces; `audio/mpeg` is .mp3.
  'audio/mpeg': { extension: 'mp3', kind: 'audio' },
  'audio/mp4': { extension: 'm4a', kind: 'audio' },
  'application/pdf': { extension: 'pdf', kind: 'file' },
  'text/plain': { extension: 'txt', kind: 'file' },
  // `D-41`: a student handing in a Word document is the real case behind
  // `pdf_upload`. **Zip was asked for and refused** - it is a container that
  // can hold anything, and §8 admits nothing executable. A docx is an
  // non-executable container served with nosniff from a server that executes
  // nothing, which is the argument that already admits PDF. Legacy
  // `application/msword` is deliberately absent: not asked for.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extension: 'docx',
    kind: 'file',
  },
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
