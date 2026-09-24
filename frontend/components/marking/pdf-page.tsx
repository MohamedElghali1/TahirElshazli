'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/**
 * Load a PDF from bytes with pdf.js (`D-40`), **lazily**: the library is
 * imported only when a marking screen asks for a PDF, never in the app shell.
 *
 * Pinned to 6.3.289 (`package.json`), past the 4.2.67 floor for
 * CVE-2024-4367. From v5 pdf.js no longer has the `isEvalSupported` path the
 * CVE abused, so there is no flag to turn off. The worker is bundled and
 * served from the web app's own origin - no CDN.
 *
 * Nothing here sends the file anywhere: the bytes came from `useFileBytes`,
 * and pdf.js renders them in the browser (`D-2`: no server-side PDF library).
 */
export async function loadPdf(bytes: ArrayBuffer): Promise<PDFDocumentProxy> {
  const pdfjs = await import('pdfjs-dist');
  if (!pdfjs.GlobalWorkerOptions.workerPort) {
    // `new Worker(new URL(…, import.meta.url))` is the form the bundler
    // recognises and emits as a same-origin asset (Next's Turbopack guide);
    // a bare URL string assigned to `workerSrc` would not be bundled.
    pdfjs.GlobalWorkerOptions.workerPort = new Worker(
      new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url),
      { type: 'module' },
    );
  }
  // pdf.js takes ownership of (transfers) the buffer it is given, so it gets a
  // copy and the caller's bytes stay usable for the next load.
  return pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;
}

/**
 * One page of a loaded PDF, drawn to a canvas that fills its box's width.
 * The box keeps the page's own aspect ratio, so an annotation's `x%`/`y%`
 * lands on the same spot of the paper at any width or zoom.
 */
export function PdfPage({ pdf, page }: { pdf: PDFDocumentProxy; page: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let task: { cancel: () => void } | null = null;
    (async () => {
      try {
        const p = await pdf.getPage(page);
        const base = p.getViewport({ scale: 1 });
        if (cancelled) return;
        setRatio(base.height / base.width);
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Render at the displayed width times the device pixel ratio, so text
        // stays sharp on a high-density screen.
        const cssWidth = canvas.parentElement?.clientWidth ?? base.width;
        const scale = (cssWidth / base.width) * (window.devicePixelRatio || 1);
        const viewport = p.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        const render = p.render({ canvas, viewport });
        task = render;
        await render.promise;
      } catch (cause) {
        if (!cancelled && !(cause instanceof Error && cause.name === 'RenderingCancelledException')) {
          setError('This page could not be drawn.');
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [pdf, page]);

  if (error) {
    return <p className="p-4 text-base text-fg-3">{error}</p>;
  }
  return (
    <div className="relative w-full" style={{ aspectRatio: ratio ? `1 / ${ratio}` : '1 / 1.414' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
