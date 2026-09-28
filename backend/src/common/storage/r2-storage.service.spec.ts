import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class S3Client {
    send = sendMock;
  }
  class PutObjectCommand {
    constructor(public input: unknown) {}
  }
  class DeleteObjectCommand {
    constructor(public input: unknown) {}
  }
  class GetObjectCommand {
    constructor(public input: unknown) {}
  }
  return { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

// Imported after the mocks so the module under test picks them up.
const { R2Storage, DEFAULT_READ_URL_TTL_SECONDS } = await import('./r2-storage.service.js');

const config = {
  accountId: 'acct',
  accessKeyId: 'key',
  secretAccessKey: 'secret',
  bucket: 'uploads',
  endpoint: 'https://acct.r2.cloudflarestorage.com',
};

describe('R2Storage', () => {
  beforeEach(() => {
    sendMock.mockReset();
    getSignedUrlMock.mockReset();
  });

  it('saves under a server-minted key and returns the stored-form URL', async () => {
    sendMock.mockResolvedValue({});
    const storage = new R2Storage(config);
    const result = await storage.save({
      bytes: Buffer.from('hello'),
      mimeType: 'application/pdf',
      extension: 'pdf',
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const command = sendMock.mock.calls[0]![0];
    expect(command.input.Bucket).toBe('uploads');
    expect(command.input.ContentType).toBe('application/pdf');
    expect(command.input.Key).toMatch(/^[0-9a-f-]{36}\.pdf$/);
    expect(result.url).toBe(`/uploads/${command.input.Key}`);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.sizeBytes).toBe(5);
  });

  it('deletes the object a stored URL names', async () => {
    sendMock.mockResolvedValue({});
    const storage = new R2Storage(config);
    const ok = await storage.remove('/uploads/abc.pdf');
    expect(ok).toBe(true);
    expect(sendMock.mock.calls[0]![0].input).toEqual({ Bucket: 'uploads', Key: 'abc.pdf' });
  });

  it('does not touch an external URL on remove', async () => {
    const storage = new R2Storage(config);
    expect(await storage.remove('https://example.com/x.pdf')).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns a presigned URL for a platform-stored key, with the default TTL', async () => {
    getSignedUrlMock.mockResolvedValue('https://signed.example/abc.pdf?sig=1');
    const storage = new R2Storage(config);
    const url = await storage.readUrl('/uploads/abc.pdf');
    expect(url).toBe('https://signed.example/abc.pdf?sig=1');
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ input: expect.objectContaining({ Key: 'abc.pdf' }) }),
      expect.objectContaining({ expiresIn: DEFAULT_READ_URL_TTL_SECONDS }),
    );
  });

  it('passes external URLs through unchanged, never calling the SDK', async () => {
    const storage = new R2Storage(config);
    const url = await storage.readUrl('https://example.com/notes.pdf');
    expect(url).toBe('https://example.com/notes.pdf');
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it('sets inline disposition for a PDF and attachment for anything else', async () => {
    getSignedUrlMock.mockResolvedValue('signed');
    const storage = new R2Storage(config);

    await storage.readUrl('/uploads/report.pdf');
    expect(getSignedUrlMock.mock.calls[0]![1].input.ResponseContentDisposition).toBe('inline');

    await storage.readUrl('/uploads/essay.docx');
    expect(getSignedUrlMock.mock.calls[1]![1].input.ResponseContentDisposition).toBe('attachment');
  });

  it('honours a custom TTL', async () => {
    getSignedUrlMock.mockResolvedValue('signed');
    const storage = new R2Storage(config);
    await storage.readUrl('/uploads/abc.pdf', 3600);
    expect(getSignedUrlMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ expiresIn: 3600 }),
    );
  });
});
