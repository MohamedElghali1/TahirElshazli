import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { UploadsService } from './uploads.service.js';
import { FileUrls } from './file-urls.service.js';
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
    readUrl: async (url) => url,
  };
  const file = (mimetype: string) => ({ buffer: Buffer.from('abc'), mimetype, size: 3 });

  it.each([
    ['audio/mpeg', 'mp3'],
    ['audio/mp4', 'm4a'],
  ])('accepts %s as audio, stored under a server-chosen .%s', async (mime, extension) => {
    const result = await new UploadsService(storage, new FileUrls(storage)).store(file(mime));
    expect(result.kind).toBe('audio');
    expect(saved.at(-1)?.extension).toBe(extension);
    expect(result.url.endsWith(`.${extension}`)).toBe(true);
  });

  it.each(['image/svg+xml', 'text/html', 'application/javascript', 'audio/x-wav', 'application/octet-stream'])(
    'still refuses %s',
    async (mime) => {
      await expect(new UploadsService(storage, new FileUrls(storage)).store(file(mime))).rejects.toBeInstanceOf(
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
    await expect(new UploadsService(null, new FileUrls(null)).store(file('audio/mpeg'))).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});

/**
 * Content sniffing (`REM-082`): for a claimed type with a known signature the
 * buffer must match it. A DOCX is a ZIP (`PK\x03\x04`) that contains an entry
 * named `word/document.xml`; `buildMinimalDocx` writes just enough of a local
 * file header - the ZIP signature, a filename-length field, and the entry
 * name bytes - to pass that check without a real Word document.
 */
describe('UploadsService: content sniffing (REM-082)', () => {
  const saved: SaveFileInput[] = [];
  const storage: FileStorage = {
    save: async (input) => {
      saved.push(input);
      return { url: `/uploads/x.${input.extension}`, sizeBytes: input.bytes.byteLength, mimeType: input.mimeType };
    },
    remove: async () => true,
    readUrl: async (url) => url,
  };
  const service = () => new UploadsService(storage, new FileUrls(storage));
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
  const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
  const WEBP = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.alloc(4), Buffer.from('WEBP', 'ascii')]);

  function buildZip(entryName: string): Buffer {
    const name = Buffer.from(entryName, 'ascii');
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // local file header signature: PK\x03\x04
    header.writeUInt16LE(20, 4); // version needed to extract
    header.writeUInt16LE(0, 6); // general purpose flag
    header.writeUInt16LE(0, 8); // compression method: stored
    header.writeUInt16LE(0, 10); // last mod time
    header.writeUInt16LE(0, 12); // last mod date
    header.writeUInt32LE(0, 14); // crc-32
    header.writeUInt32LE(0, 18); // compressed size
    header.writeUInt32LE(0, 22); // uncompressed size
    header.writeUInt16LE(name.length, 26); // file name length
    header.writeUInt16LE(0, 28); // extra field length
    return Buffer.concat([header, name]);
  }

  it('accepts a real signature for each type that has one', async () => {
    for (const [mimetype, bytes] of [
      ['application/pdf', PDF],
      [DOCX_MIME, buildZip('word/document.xml')],
      ['image/png', PNG],
      ['image/jpeg', JPEG],
      ['image/webp', WEBP],
    ] as const) {
      await expect(service().store({ buffer: bytes, mimetype, size: bytes.byteLength })).resolves.toMatchObject({
        kind: mimetype === DOCX_MIME || mimetype === 'application/pdf' ? 'file' : 'image',
      });
    }
  });

  it('refuses a PDF labelled as a Word document', async () => {
    await expect(service().store({ buffer: PDF, mimetype: DOCX_MIME, size: PDF.byteLength })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses a ZIP without a word/document.xml entry, claimed as a Word document', async () => {
    const zip = buildZip('not-a-word-doc.xml');
    await expect(service().store({ buffer: zip, mimetype: DOCX_MIME, size: zip.byteLength })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses an arbitrary binary claimed as application/pdf', async () => {
    const junk = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]);
    await expect(
      service().store({ buffer: junk, mimetype: 'application/pdf', size: junk.byteLength }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a JPEG relabelled as a PNG, and a PNG relabelled as a JPEG', async () => {
    await expect(service().store({ buffer: JPEG, mimetype: 'image/png', size: JPEG.byteLength })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      service().store({ buffer: PNG, mimetype: 'image/jpeg', size: PNG.byteLength }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps trusting the claim for a type with no listed signature', async () => {
    await expect(
      service().store({ buffer: Buffer.from('not actually mp3 bytes'), mimetype: 'audio/mpeg', size: 20 }),
    ).resolves.toMatchObject({ kind: 'audio' });
  });
});
