import { BadRequestException } from '@nestjs/common';
import { checkSubmission, hasUploadMode, mimeTypesForModes } from './submission-rules.js';

const PDF = '/uploads/11111111-1111-4111-8111-111111111111.pdf';
const JPG = '/uploads/22222222-2222-4222-8222-222222222222.jpg';
const PNG = '/uploads/33333333-3333-4333-8333-333333333333.png';
const WEBP = '/uploads/44444444-4444-4444-8444-444444444444.webp';
const GIF = '/uploads/55555555-5555-4555-8555-555555555555.gif';
const TXT = '/uploads/66666666-6666-4666-8666-666666666666.txt';
const DOC = 'https://docs.google.com/document/d/abc';

function refused(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(BadRequestException);
    return (e as BadRequestException).message;
  }
  throw new Error('expected a 400');
}

describe('D-47: what a hand-in may be', () => {
  describe('a task stating no modes keeps the old rule', () => {
    it('accepts a link, a typed answer, or both, and leaves the file set alone', () => {
      expect(checkSubmission([], { fileUrl: DOC })).toEqual({ fileUrl: DOC, files: undefined, answerText: undefined });
      expect(checkSubmission([], { answerText: 'x' })).toMatchObject({ answerText: 'x', files: undefined });
    });
    it('refuses nothing at all, and refuses uploaded files', () => {
      expect(refused(() => checkSubmission([], {}))).toMatch(/At least one/);
      expect(refused(() => checkSubmission([], { files: [PDF] }))).toMatch(/not uploaded files/);
    });
  });

  describe('pdf_upload', () => {
    it('takes exactly one uploaded PDF, a note alongside, and clears any link', () => {
      expect(checkSubmission(['pdf_upload'], { files: [PDF], answerText: 'note' })).toEqual({
        fileUrl: null,
        files: [{ url: PDF, mimeType: 'application/pdf' }],
        answerText: 'note',
      });
    });
    it('refuses two PDFs, photos, a link, and a note alone', () => {
      expect(refused(() => checkSubmission(['pdf_upload'], { files: [PDF, PDF.replace('1111-4111', '1112-4111')] }))).toMatch(/one PDF/);
      expect(refused(() => checkSubmission(['pdf_upload'], { files: [JPG] }))).toMatch(/not photos/);
      expect(refused(() => checkSubmission(['pdf_upload'], { fileUrl: DOC }))).toMatch(/not a link/);
      expect(refused(() => checkSubmission(['pdf_upload'], { answerText: 'only words' }))).toMatch(/note on its own/);
    });
  });

  describe('photo_upload', () => {
    it('takes 1-5 uploaded JPEG/PNG/WebP photos, in order, typed by the server', () => {
      expect(checkSubmission(['photo_upload'], { files: [JPG, PNG, WEBP] }).files).toEqual([
        { url: JPG, mimeType: 'image/jpeg' },
        { url: PNG, mimeType: 'image/png' },
        { url: WEBP, mimeType: 'image/webp' },
      ]);
    });
    it('refuses six photos, a GIF, a duplicate, and a mixed set', () => {
      const six = Array.from({ length: 6 }, (_, i) => `/uploads/0000000${i}-0000-4000-8000-000000000000.jpg`);
      expect(refused(() => checkSubmission(['photo_upload'], { files: six }))).toMatch(/at most 5/);
      expect(refused(() => checkSubmission(['photo_upload'], { files: [GIF] }))).toMatch(/one kind of file/);
      expect(refused(() => checkSubmission(['photo_upload'], { files: [JPG, JPG] }))).toMatch(/twice/);
      expect(refused(() => checkSubmission(['pdf_upload', 'photo_upload'], { files: [PDF, JPG] }))).toMatch(/one kind of file/);
    });
  });

  describe('doc_link', () => {
    it('takes one link, a note alongside, and clears the file set', () => {
      expect(checkSubmission(['doc_link'], { fileUrl: DOC, answerText: 'n' })).toEqual({
        fileUrl: DOC,
        files: [],
        answerText: 'n',
      });
    });
    it('refuses files, and files with a link', () => {
      expect(refused(() => checkSubmission(['doc_link'], { files: [PDF] }))).toMatch(/not a PDF/);
      expect(refused(() => checkSubmission(['doc_link', 'pdf_upload'], { files: [PDF], fileUrl: DOC }))).toMatch(/not both/);
    });
  });

  it('R-8: accepts only the exact server-minted shape, not a prefix match', () => {
    expect(refused(() => checkSubmission(['pdf_upload'], { files: ['/uploads/../x.pdf'] }))).toMatch(/Upload each file/);
    expect(refused(() => checkSubmission(['pdf_upload'], { files: ['/uploads/sub/11111111-1111-4111-8111-111111111111.pdf'] }))).toMatch(/Upload each file/);
  });

  it('R-6: a moded hand-in without a note clears the old note; the old rule leaves it', () => {
    expect(checkSubmission(['pdf_upload'], { files: [PDF] }).answerText).toBeNull();
    expect(checkSubmission(['doc_link'], { fileUrl: DOC }).answerText).toBeNull();
    expect(checkSubmission([], { fileUrl: DOC }).answerText).toBeUndefined();
  });

  it('refuses a file the platform did not store, or one whose type the whitelist does not mint', () => {
    expect(refused(() => checkSubmission(['pdf_upload'], { files: ['https://evil.example/x.pdf'] }))).toMatch(/Upload each file/);
    expect(refused(() => checkSubmission(['pdf_upload'], { files: ['/uploads/11111111-1111-4111-8111-111111111111.exe'] }))).toMatch(/Upload each file/);
    // A stored text file is platform-stored but no mode takes it.
    expect(refused(() => checkSubmission(['pdf_upload', 'photo_upload'], { files: [TXT] }))).toMatch(/one kind of file/);
  });

  it('derives the file types from the modes, and says when a mode is an upload', () => {
    expect(mimeTypesForModes(['pdf_upload'])).toEqual(['application/pdf']);
    expect(mimeTypesForModes(['photo_upload', 'doc_link'])).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(mimeTypesForModes(['doc_link'])).toEqual([]);
    expect(hasUploadMode(['doc_link'])).toBe(false);
    expect(hasUploadMode(['doc_link', 'photo_upload'])).toBe(true);
  });
});
