import { isPlatformStored, storedMimeTypeOf } from './upload-types.js';

describe('isPlatformStored / storedMimeTypeOf (unit 7)', () => {
  it('recognises only the platform prefix', () => {
    expect(isPlatformStored('/uploads/1b.png')).toBe(true);
    expect(isPlatformStored('https://example.com/uploads/1b.png')).toBe(false);
    expect(isPlatformStored('uploads/1b.png')).toBe(false);
    expect(isPlatformStored(null)).toBe(false);
    expect(isPlatformStored(undefined)).toBe(false);
  });

  it('reads the type back from the server-minted extension', () => {
    expect(storedMimeTypeOf('/uploads/a.pdf')).toBe('application/pdf');
    expect(storedMimeTypeOf('/uploads/a.jpg')).toBe('image/jpeg');
    expect(storedMimeTypeOf('/uploads/a.PNG')).toBe('image/png');
    expect(storedMimeTypeOf('/uploads/a.webp')).toBe('image/webp');
    // Not minted by the whitelist, or not ours at all.
    expect(storedMimeTypeOf('/uploads/a.svg')).toBeNull();
    expect(storedMimeTypeOf('/uploads/noext')).toBeNull();
    expect(storedMimeTypeOf('https://example.com/a.pdf')).toBeNull();
  });
});
