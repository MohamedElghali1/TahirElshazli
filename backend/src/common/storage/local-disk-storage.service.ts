import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type {
  FileStorage,
  SaveFileInput,
  StoredFile,
} from './file-storage.interface.js';
import { UPLOAD_URL_PREFIX } from './upload-types.js';
import { resolveUploadDir } from '../config/env.js';

/**
 * Files on the local disk. **Development only.**
 *
 * The point of it is that the authoring UI has a working file picker before
 * Cloudflare R2 exists (CLAUDE.md §3 - third-party subscriptions are the
 * client's to provision, and the code has to degrade sensibly until they are).
 * Everything above `FileStorage` is written once and does not change when R2
 * lands.
 *
 * Why it must not run in production, spelled out because the failure is quiet:
 * a container filesystem is ephemeral, so every uploaded image disappears on
 * the next deploy while the `blog_post_media` rows pointing at them survive -
 * a gallery of broken images and no error anywhere. With more than one replica
 * it is worse, because a file written on replica A 404s on replica B for half
 * the requests. `StorageModule` refuses to wire this driver in production for
 * exactly the reasons `PERSISTENCE_DRIVER=memory` is refused there.
 */
@Injectable()
export class LocalDiskStorage implements FileStorage {
  private readonly logger = new Logger(LocalDiskStorage.name);

  /** Absolute, resolved once, and the only directory this class will touch. */
  private readonly root = resolve(resolveUploadDir());

  async save(input: SaveFileInput): Promise<StoredFile> {
    // The name is **server-minted** and the client's filename is never read.
    // That is what makes path traversal structurally impossible here rather
    // than something a sanitiser has to catch: there is no attacker-controlled
    // component in the path at all.
    const name = `${randomUUID()}.${input.extension}`;

    await mkdir(this.root, { recursive: true });
    // `wx` fails rather than overwriting. A UUID collision is not going to
    // happen, but "silently replaced someone else's file" is not a failure
    // mode worth leaving open for the sake of one flag.
    await writeFile(join(this.root, name), input.bytes, { flag: 'wx' });

    return {
      url: `${UPLOAD_URL_PREFIX}${name}`,
      sizeBytes: input.bytes.byteLength,
      mimeType: input.mimeType,
    };
  }

  async remove(url: string): Promise<boolean> {
    if (!url.startsWith(UPLOAD_URL_PREFIX)) {
      // Not ours - an externally-hosted URL on a media row. Deleting the row
      // is right; reaching out to someone else's host is not.
      return false;
    }
    const name = url.slice(UPLOAD_URL_PREFIX.length);

    // Re-derived and re-checked rather than trusted, even though every URL
    // this sees was minted by `save` above. The stored value has been through
    // a database and a request body since then, so `/uploads/../../.env` is a
    // string that could arrive here, and `resolve` is what makes it not
    // matter: anything that escapes the root is refused.
    const target = resolve(this.root, name);
    if (target !== join(this.root, name)) {
      this.logger.warn('Refusing to delete a path outside the upload root');
      return false;
    }

    try {
      await unlink(target);
      return true;
    } catch {
      // Already gone. The caller wants the media row removed either way, so
      // this is not an error to propagate.
      return false;
    }
  }

  /** Where the files live, so `main.ts` can serve them from the same path. */
  get directory(): string {
    return this.root;
  }
}
