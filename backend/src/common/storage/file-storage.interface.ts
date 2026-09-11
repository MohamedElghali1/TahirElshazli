/**
 * File storage, behind an interface.
 *
 * CLAUDE.md §3 requires the infrastructure to be swappable without code
 * changes - the target is Cloudflare R2, the client provisions it, and until
 * they do nothing should be written against R2's SDK. So this is the seam:
 * `LocalDiskStorage` today, `R2Storage` the day there are credentials, and
 * nothing above this line changes.
 *
 * It is also the answer to the limitation `is-public-http-url.validator.ts`
 * documents in as many words: *"the real fix is for clients to stop supplying
 * URLs at all - uploads should go through our own storage with a server-minted
 * key."* This is that path. A caller hands over bytes; it never names the
 * destination.
 */

/** What a caller gets back. The URL is the only part they may use. */
export interface StoredFile {
  /**
   * Where the file can now be read.
   *
   * Root-relative (`/uploads/<name>`) for the local driver and absolute for a
   * CDN-backed one, which is why every consumer treats this as an opaque
   * string and why `IsBlogMediaUrl` accepts both shapes.
   */
  url: string;
  /** As written, not as claimed by the client. */
  sizeBytes: number;
  /** The type the *server* settled on, never the browser's Content-Type. */
  mimeType: string;
}

export interface SaveFileInput {
  bytes: Buffer;
  /**
   * The MIME type the server has already validated against its whitelist.
   *
   * Deliberately not "the type the client sent": `UploadsService` maps the
   * request's Content-Type through a fixed table before this is called, so a
   * driver never has to decide whether a type is acceptable and cannot be the
   * place that whitelist is bypassed.
   */
  mimeType: string;
  /** The extension to store under, taken from the same table. No leading dot. */
  extension: string;
}

export interface FileStorage {
  save(input: SaveFileInput): Promise<StoredFile>;
  /**
   * Best-effort delete. Returns false when the object was already gone, which
   * is not an error - a caller removing a media row wants the row gone whether
   * or not the bytes were still there.
   */
  remove(url: string): Promise<boolean>;
}

export const FILE_STORAGE = Symbol('FILE_STORAGE');
