'use client';

import { useEffect, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Loader } from '@/components/ui';
import type { StudentAnnotation } from '@/lib/types';
import { AnnotationLayer } from './annotation-layer';
import { PdfPage, loadPdf } from './pdf-page';
import { useFileBytes } from './use-file-bytes';

/**
 * The student's own returned paper with the teacher's marks drawn over it
 * (`MARK-5`, `D-2`): the original, untouched, plus the marks as data. Read
 * only. Every page is shown in order, each with its own marks; comments are
 * listed under the paper, numbered to match their pins.
 *
 * The server sends marks only for the student's own submission and only once
 * it is returned; this component only draws what it is given.
 */
export function MarkedCopy({
  fileUrl,
  annotations,
}: {
  fileUrl: string;
  annotations: readonly StudentAnnotation[];
}) {
  const isPdf = /\.pdf$/i.test(fileUrl);
  const file = useFileBytes(fileUrl);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isPdf || !file.bytes) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    loadPdf(file.bytes)
      .then((d) => {
        loaded = d;
        if (!cancelled) setPdf(d);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      void loaded?.loadingTask.destroy();
    };
  }, [isPdf, file.bytes]);

  const mine = annotations.filter((a) => a.fileUrl === fileUrl);
  const comments = mine.filter((a) => a.kind === 'comment');
  const numberOf = (id: string) => {
    const i = comments.findIndex((c) => c.id === id);
    return i === -1 ? undefined : i + 1;
  };

  if (file.error || failed) {
    return <p className="text-base text-fg-3">Your marked paper could not be shown here.</p>;
  }
  if (file.loading || (isPdf && !pdf)) {
    return (
      <div className="flex justify-center p-4">
        <Loader label="Loading your marked paper" />
      </div>
    );
  }

  const pages = isPdf && pdf ? Array.from({ length: pdf.numPages }, (_, i) => i + 1) : [1];

  return (
    <div className="flex flex-col gap-3">
      {pages.map((page) => (
        <div key={page} dir="ltr" className="relative w-full overflow-hidden rounded-md bg-surface-2">
          {isPdf && pdf ? (
            <PdfPage pdf={pdf} page={page} />
          ) : (
            // A `blob:` URL of bytes fetched through CORS - see `useFileBytes`.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.objectUrl ?? ''} alt="Your work, marked" className="block h-auto w-full" />
          )}
          <AnnotationLayer marks={mine.filter((a) => a.page === page)} numberOf={numberOf} />
        </div>
      ))}
      {comments.length > 0 && (
        <ol className="flex flex-col gap-1">
          {comments.map((c) => (
            <li key={c.id} className="text-base text-fg-2">
              <span className="num text-fg-4">{numberOf(c.id)}.</span>{' '}
              {/* Text, never HTML (SECURITY.md §2.5). */}
              <span dir="auto">{c.text}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
