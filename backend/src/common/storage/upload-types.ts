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
  // Word hand-ins (`REM-082`, `D-47`). A `.docx` is a ZIP; served the same
  // non-executable way as every other `file` kind.
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    extension: 'docx',
    kind: 'file',
  },
};

/**
 * Magic-byte signatures for the declared types that have a well-known one
 * (`REM-082`). A declared type absent here keeps today's behaviour - the
 * claimed MIME type is trusted once it is in the whitelist. Where a
 * signature exists, the buffer must match it or the upload is refused: this
 * closes the gap the module used to document as a known limitation ("a PHP
 * script sent as `image/png` is stored as a .png").
 *
 * DOCX is a ZIP (`PK\x03\x04`) whose central directory is not worth parsing
 * for one entry name: a plain byte search of the whole buffer for
 * `word/document.xml` is bounded (at most `MAX_UPLOAD_BYTES`) and cannot
 * false-positive on a file that is not actually a ZIP, because the ZIP magic
 * is checked first.
 */
const PDF_SIGNATURE = Buffer.from('%PDF-', 'ascii');
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const DOCX_ENTRY_NAME = Buffer.from('word/document.xml', 'ascii');
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff]);

export const UPLOAD_SIGNATURES: Readonly<Record<string, (buffer: Buffer) => boolean>> = {
  'application/pdf': (buffer) => buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (buffer) =>
    buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE) && buffer.includes(DOCX_ENTRY_NAME),
  'image/png': (buffer) => buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
  'image/jpeg': (buffer) => buffer.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE),
  'image/webp': (buffer) =>
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
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

export const ALLOWED_AVATAR_MIME_TYPES = Object.entries(ALLOWED_UPLOAD_TYPES)
  .filter(([_, type]) => type.kind === 'image')
  .map(([mime]) => mime);

export const AVATAR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * The single path prefix the local driver serves from, and the only relative
 * shape `IsBlogMediaUrl` will accept. Both sides import it rather than
 * repeating the string, so tightening the validator cannot silently orphan
 * every file already stored.
 */
export const UPLOAD_URL_PREFIX = '/uploads/';

/**
 * Whether a URL names a file **this platform stored** (unit 7, `D-41`).
 *
 * Server-derived, never client-declared: a submission's file can be drawn on
 * only when the platform serves it, because a PDF needs its bytes and a
 * pasted third-party URL cannot be fetched without an SSRF-shaped proxy, nor
 * auto-loaded into a staff browser without leaking their address to a host the
 * student chose (unit-7 plan, `B-4`). Today that is the local driver's
 * `/uploads/` prefix; an R2 driver would add its own origin here.
 */
export function isPlatformStored(url: string | null | undefined): boolean {
  return typeof url === 'string' && url.startsWith(UPLOAD_URL_PREFIX);
}

/**
 * The type a platform-stored URL was stored as, read back from its
 * **server-minted** extension. The extension came from `ALLOWED_UPLOAD_TYPES`
 * when the bytes were written, so this is the server's own decision rather
 * than the client's claim. Null for anything not platform-stored, or with an
 * extension the whitelist does not mint.
 */
export function storedMimeTypeOf(url: string): string | null {
  if (!isPlatformStored(url)) {
    return null;
  }
  const dot = url.lastIndexOf('.');
  const extension = dot === -1 ? '' : url.slice(dot + 1).toLowerCase();
  const match = Object.entries(ALLOWED_UPLOAD_TYPES).find(
    ([, type]) => type.extension === extension,
  );
  return match ? match[0] : null;
}
