import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { UploadsService } from './uploads.service.js';
import type { FileStorage, SaveFileInput } from './file-storage.interface.js';
import { ALLOWED_UPLOAD_TYPES } from './upload-types.js';

/**
 * The staff upload whitelist (`CLAUDE.md` §8). Unit 6 (`D-29`) added audio for
 * listening tasks and decoupled `kind` from the blog's vocabulary; these cases
 * pin both, and pin that nothing executable came in with them.
 */
describe('UploadsService: the whitelist', () => {
  const saved: SaveFileInput[] = [];
  const storage: FileStorage = {
    save: async (input) => {
      saved.push(input);
      return { url: `/uploads/x.${input.extension}`, sizeBytes: input.bytes.byteLength, mimeType: input.mimeType };
    },
    remove: async () => true,
  };
  const file = (mimetype: string) => ({ buffer: Buffer.from('abc'), mimetype, size: 3 });

  it.each([
    ['audio/mpeg', 'mp3'],
    ['audio/mp4', 'm4a'],
  ])('accepts %s as audio, stored under a server-chosen .%s', async (mime, extension) => {
    const result = await new UploadsService(storage).store(file(mime));
    expect(result.kind).toBe('audio');
    expect(saved.at(-1)?.extension).toBe(extension);
    expect(result.url.endsWith(`.${extension}`)).toBe(true);
  });

  it.each(['image/svg+xml', 'text/html', 'application/javascript', 'audio/x-wav', 'application/octet-stream'])(
    'still refuses %s',
    async (mime) => {
      await expect(new UploadsService(storage).store(file(mime))).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('keeps every existing type on its old kind', () => {
    expect(ALLOWED_UPLOAD_TYPES['image/png']?.kind).toBe('image');
    expect(ALLOWED_UPLOAD_TYPES['video/mp4']?.kind).toBe('video');
    expect(ALLOWED_UPLOAD_TYPES['application/pdf']?.kind).toBe('file');
  });

  it('is an honest 503 when no storage driver is configured', async () => {
    await expect(new UploadsService(null).store(file('audio/mpeg'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
