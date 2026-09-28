import { describe, expect, it, vi } from 'vitest';
import { FileUrls } from './file-urls.service.js';
import type { FileStorage } from './file-storage.interface.js';

describe('FileUrls', () => {
  it('is a no-op end to end when no driver is configured', async () => {
    const fileUrls = new FileUrls(null);
    expect(await fileUrls.forRead('/uploads/a.pdf')).toBe('/uploads/a.pdf');
    expect(await fileUrls.forRead(null)).toBeNull();
    const map = await fileUrls.mapping(['/uploads/a.pdf', null, '/uploads/a.pdf']);
    expect(map.get('/uploads/a.pdf')).toBe('/uploads/a.pdf');
  });

  it('delegates a single URL to the driver', async () => {
    const readUrl = vi.fn(async (url: string) => `signed:${url}`);
    const storage: FileStorage = { save: vi.fn(), remove: vi.fn(), readUrl };
    const fileUrls = new FileUrls(storage);
    expect(await fileUrls.forRead('/uploads/a.pdf')).toBe('signed:/uploads/a.pdf');
  });

  it('resolves each distinct URL exactly once, so a repeated URL matches itself', async () => {
    const readUrl = vi.fn(async (url: string) => `signed-${Math.random()}:${url}`);
    const storage: FileStorage = { save: vi.fn(), remove: vi.fn(), readUrl };
    const fileUrls = new FileUrls(storage);

    // A submission's file and a mark drawn on it both carry the same stored
    // URL; the marking UI matches them by exact string equality.
    const map = await fileUrls.mapping(['/uploads/a.pdf', '/uploads/a.pdf', '/uploads/b.pdf']);
    expect(readUrl).toHaveBeenCalledTimes(2);
    expect(map.get('/uploads/a.pdf')).toBe(map.get('/uploads/a.pdf'));
    expect(map.get('/uploads/a.pdf')).not.toBe(map.get('/uploads/b.pdf'));
  });

  it('passes a TTL override through', async () => {
    const readUrl = vi.fn(async (url: string) => url);
    const storage: FileStorage = { save: vi.fn(), remove: vi.fn(), readUrl };
    const fileUrls = new FileUrls(storage);
    await fileUrls.forRead('/uploads/a.pdf', 3600);
    expect(readUrl).toHaveBeenCalledWith('/uploads/a.pdf', 3600);
  });
});
