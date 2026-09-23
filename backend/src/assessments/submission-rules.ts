import { BadRequestException } from '@nestjs/common';
import { isPlatformStored, storedMimeTypeOf } from '../common/storage/upload-types.js';
import type { SubmissionFile, SubmissionMode } from './interfaces/assessment-repository.interface.js';

/** `D-47`: what a photo may be. No HEIC (`D-48` (d)), no GIF/AVIF. */
export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PDF_MIME_TYPE = 'application/pdf';
/** `PRODUCT_SPEC.md` §2.1: "photo of written work (≤5)". */
export const MAX_PHOTOS = 5;

/**
 * The file types a task's modes admit (`D-47`): derived, so the modes and
 * `allowedFileTypes` can never disagree. Empty when no upload mode is stated.
 */
export function mimeTypesForModes(modes: readonly SubmissionMode[]): string[] {
  return [
    ...(modes.includes('pdf_upload') ? [PDF_MIME_TYPE] : []),
    ...(modes.includes('photo_upload') ? [...PHOTO_MIME_TYPES] : []),
  ];
}

export function hasUploadMode(modes: readonly SubmissionMode[]): boolean {
  return modes.includes('pdf_upload') || modes.includes('photo_upload');
}

export interface SubmissionInput {
  fileUrl?: string;
  /** Platform-stored URLs from `POST /assessments/:id/files`. */
  files?: string[];
  answerText?: string;
}

/** What the repository is asked to store. `undefined` leaves a field alone. */
export interface SubmissionWrite {
  fileUrl: string | null | undefined;
  files: SubmissionFile[] | undefined;
  answerText: string | undefined;
}

const HAND_IN: Record<SubmissionMode, string> = {
  pdf_upload: 'a PDF',
  photo_upload: 'photos of your work',
  doc_link: 'a Google Doc link',
};

function list(modes: readonly SubmissionMode[]): string {
  const words = modes.map((m) => HAND_IN[m]);
  return words.length <= 1 ? (words[0] ?? '') : `${words.slice(0, -1).join(', ')} or ${words.at(-1)}`;
}

/**
 * `D-47`: the modes are the rule. Returns what to store, or throws a 400 that
 * says what the task wants.
 *
 * - **No modes stated:** today's rule, unchanged - a public link and/or a
 *   typed answer, at least one; no uploaded files.
 * - **Modes stated:** exactly one mode per submission. `pdf_upload` is one
 *   uploaded PDF; `photo_upload` is 1-5 uploaded photos; `doc_link` is one
 *   public link. A typed answer may go with any of them as a note, never alone.
 *   The whole hand-in is replaced on resubmission (`D-48` (c)), so both the
 *   file set and the link are always written.
 *
 * A file URL is accepted only when it is platform-stored and its type - read
 * from the server-minted extension, never from the client - fits the mode.
 * It does not prove the student uploaded that file (assumption A-15).
 */
export function checkSubmission(
  modes: readonly SubmissionMode[],
  input: SubmissionInput,
): SubmissionWrite {
  const files = input.files ?? [];
  const link = input.fileUrl;

  if (modes.length === 0) {
    if (files.length > 0) {
      throw new BadRequestException(
        'This task takes a link or a typed answer, not uploaded files.',
      );
    }
    if (!link && !input.answerText) {
      throw new BadRequestException('At least one of fileUrl or answerText must be provided');
    }
    return { fileUrl: link, files: undefined, answerText: input.answerText };
  }

  if (files.length > 0 && link) {
    throw new BadRequestException('Hand in either files or a link, not both.');
  }
  if (files.length === 0 && !link) {
    throw new BadRequestException(
      `This task asks for ${list(modes)}. A note on its own is not a submission.`,
    );
  }

  if (link) {
    if (!modes.includes('doc_link')) {
      throw new BadRequestException(`This task asks for ${list(modes)}, not a link.`);
    }
    return { fileUrl: link, files: [], answerText: input.answerText };
  }

  const typed: SubmissionFile[] = files.map((url) => {
    const mimeType = isPlatformStored(url) ? storedMimeTypeOf(url) : null;
    if (!mimeType) {
      throw new BadRequestException(
        'Upload each file with this task first; only uploaded files can be handed in.',
      );
    }
    return { url, mimeType };
  });
  if (new Set(files).size !== files.length) {
    throw new BadRequestException('The same file is listed twice.');
  }

  const allPdf = typed.every((f) => f.mimeType === PDF_MIME_TYPE);
  const allPhotos = typed.every((f) => (PHOTO_MIME_TYPES as readonly string[]).includes(f.mimeType));
  if (allPdf) {
    if (!modes.includes('pdf_upload')) {
      throw new BadRequestException(`This task asks for ${list(modes)}, not a PDF.`);
    }
    if (typed.length !== 1) {
      throw new BadRequestException('Hand in one PDF.');
    }
  } else if (allPhotos) {
    if (!modes.includes('photo_upload')) {
      throw new BadRequestException(`This task asks for ${list(modes)}, not photos.`);
    }
    if (typed.length > MAX_PHOTOS) {
      throw new BadRequestException(`Hand in at most ${MAX_PHOTOS} photos.`);
    }
  } else {
    throw new BadRequestException(
      'Hand in one kind of file: a PDF, or photos (JPEG, PNG or WebP).',
    );
  }
  return { fileUrl: null, files: typed, answerText: input.answerText };
}
