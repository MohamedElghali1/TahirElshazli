'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button, Callout, Loader, TextInput, cx } from '@/components/ui';
import type { AnnotationKind, AnnotationPoint, SubmissionDocument } from '@/lib/types';
import { AnnotationLayer, type DrawnMark } from './annotation-layer';
import { PdfPage, loadPdf } from './pdf-page';
import { useFileBytes } from './use-file-bytes';

export type Tool = 'select' | AnnotationKind | 'eraser';

/** A new mark, before the server has it. `fileUrl` is added by the caller. */
export interface NewMark {
  page: number;
  kind: AnnotationKind;
  xPercent: number;
  yPercent: number;
  text?: string;
  path?: AnnotationPoint[];
}

/** Server bounds (`AnnotationWriteDto`, A-11): 2..2000 points per stroke. */
const MAX_POINTS = 2000;
/** Drop a point closer than this to the last kept one, in percent of the page. */
const MIN_STEP = 0.25;
/** How near, in percent of the page, the eraser must pass to take a mark. */
const ERASE_RADIUS = 2;

/** Zoom bounds and step (a multiple of the fitted width). */
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;
const ZOOM_STEP = 0.25;

const round = (n: number) => Math.round(n * 100) / 100;
const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * One page of one platform-stored file, with the marks on it and - when a
 * tool is chosen - the pointer handling to add or erase them (`MARK-4`).
 *
 * Every finished pin or stroke is saved at once through `onCreate` (DoD 9:
 * nothing important lives only in the browser). A stroke is drawn dashed until
 * the server has it; a failed save stays dashed and the caller says so.
 *
 * The eraser (`D-2`, `D-42` (a)) takes only marks `canErase` allows - the
 * caller's own - and never touches the page: there is nothing to erase but
 * data. The server refuses anyone else's with a 403 regardless.
 */
export function MarkingSurface({
  doc,
  page,
  onPageCount,
  marks,
  tool,
  canErase,
  onCreate,
  onErase,
  numberOf,
  highlightId,
  tools,
  footer,
}: {
  doc: SubmissionDocument;
  page: number;
  onPageCount?: (n: number) => void;
  marks: readonly DrawnMark[];
  tool: Tool;
  canErase: (mark: DrawnMark) => boolean;
  /** Resolves `true` once saved, `false` on failure. Never rejects - the caller reports errors. */
  onCreate: (mark: NewMark) => Promise<boolean>;
  /** Never rejects - the caller reports errors. */
  onErase: (mark: DrawnMark) => Promise<void>;
  numberOf?: (id: string) => number | undefined;
  highlightId?: string | null;
  /** The tool buttons; rendered in the surface's own toolbar so they stay reachable in full screen. */
  tools?: ReactNode;
  /** Page navigation etc.; likewise rendered inside the full-screen area. */
  footer?: ReactNode;
}) {
  // `doc.url` is the stored form - the identity a mark anchors on (`D-41`) and
  // what creating one sends back. It is never itself fetchable behind a
  // private R2 bucket; `readUrl` is (`REM-030`).
  const file = useFileBytes(doc.annotatable ? doc.readUrl : null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const drawing = useRef<{ kind: 'pen' | 'highlight'; path: AnnotationPoint[] } | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const [live, setLive] = useState<{ id: string; kind: 'pen' | 'highlight'; path: AnnotationPoint[] }[]>([]);
  const [comment, setComment] = useState<{ x: number; y: number; text: string } | null>(null);
  // Zoom is the page box's WIDTH as a multiple of the viewport width (never a
  // CSS transform), so every percent coordinate keeps meaning "this fraction
  // of the paper" and `at()` reads the box's real laid-out rect.
  const [zoom, setZoom] = useState(1);
  const areaRef = useRef<HTMLDivElement>(null);
  const [nativeFs, setNativeFs] = useState(false);
  // Fallback when the Fullscreen API is missing or refused: a fixed overlay.
  const [overlay, setOverlay] = useState(false);
  const full = nativeFs || overlay;

  useEffect(() => {
    const onChange = () => setNativeFs(document.fullscreenElement === areaRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOverlay(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay]);

  const toggleFull = useCallback(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => undefined);
    } else if (overlay) {
      setOverlay(false);
    } else if (areaRef.current?.requestFullscreen) {
      await areaRef.current.requestFullscreen().catch(() => setOverlay(true));
    } else {
      setOverlay(true);
    }
  }, [overlay]);
  const setZoomTo = (z: number) => setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100)));

  useEffect(() => {
    if (doc.kind !== 'pdf' || !file.bytes) return;
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    loadPdf(file.bytes)
      .then((d) => {
        loaded = d;
        if (cancelled) return;
        setPdf(d);
        onPageCount?.(d.numPages);
      })
      .catch(() => !cancelled && setPdfError('This PDF could not be opened.'));
    return () => {
      cancelled = true;
      // The loading task owns the worker-side document; destroying it frees both.
      void loaded?.loadingTask.destroy();
    };
    // `onPageCount` is a setter from the parent; re-running on its identity
    // would reload the document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.kind, file.bytes]);

  useEffect(() => {
    if (doc.kind === 'image') onPageCount?.(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.kind]);

  if (!doc.annotatable) {
    return (
      <Callout
        tone="neutral"
        title={doc.kind === 'link' ? 'This work is a link' : 'This file cannot be marked up here'}
        action={
          <a href={doc.readUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-4 hover:underline">
            Open original
          </a>
        }
      >
        Grade it with a mark and feedback.
      </Callout>
    );
  }
  /** Pointer position as percent of the page box, from its PHYSICAL top-left. */
  const at = (e: React.PointerEvent): AnnotationPoint => {
    const rect = boxRef.current!.getBoundingClientRect();
    return [
      round(clamp(((e.clientX - rect.left) / rect.width) * 100)),
      round(clamp(((e.clientY - rect.top) / rect.height) * 100)),
    ];
  };

  const eraseAt = ([x, y]: AnnotationPoint) => {
    for (const m of marks) {
      if (erased.current.has(m.id) || !canErase(m)) continue;
      const near = (px: number, py: number) => Math.hypot(px - x, py - y) <= ERASE_RADIUS;
      const hit = m.path ? m.path.some(([px, py]) => near(px, py)) : near(m.xPercent, m.yPercent);
      if (hit) {
        erased.current.add(m.id);
        void onErase(m).finally(() => erased.current.delete(m.id));
      }
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === 'select') return;
    e.preventDefault();
    const point = at(e);
    if (tool === 'pen' || tool === 'highlight') {
      (e.target as Element).setPointerCapture(e.pointerId);
      drawing.current = { kind: tool, path: [point] };
      setLive([{ id: 'drawing', kind: tool, path: [point] }]);
    } else if (tool === 'eraser') {
      (e.target as Element).setPointerCapture(e.pointerId);
      eraseAt(point);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (tool === 'eraser' && e.buttons === 1) {
      eraseAt(at(e));
      return;
    }
    const d = drawing.current;
    if (!d) return;
    const point = at(e);
    const last = d.path[d.path.length - 1]!;
    if (Math.hypot(point[0] - last[0], point[1] - last[1]) < MIN_STEP || d.path.length >= MAX_POINTS) return;
    d.path.push(point);
    setLive([{ id: 'drawing', kind: d.kind, path: [...d.path] }]);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (tool === 'tick' || tool === 'cross') {
      const [x, y] = at(e);
      void onCreate({ page, kind: tool, xPercent: x, yPercent: y });
      return;
    }
    if (tool === 'comment') {
      const [x, y] = at(e);
      setComment({ x, y, text: '' });
      return;
    }
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;
    if (d.path.length < 2) {
      setLive([]);
      return;
    }
    const id = `pending-${Date.now()}`;
    setLive([{ id, kind: d.kind, path: d.path }]);
    void onCreate({ page, kind: d.kind, xPercent: d.path[0]![0], yPercent: d.path[0]![1], path: d.path })
      // Saved: the server's copy replaces the dashed one. Failed: it stays
      // dashed, and the caller shows why.
      .then((saved) => {
        if (saved) setLive((l) => l.filter((s) => s.id !== id));
      });
  };

  const waiting = file.loading || (doc.kind === 'pdf' && !pdf && !pdfError && !file.error);
  const failed = file.error || pdfError;

  return (
    <div
      ref={areaRef}
      className={cx(
        'flex flex-col gap-2',
        overlay && 'fixed inset-0 z-[60] p-4',
        full && 'h-full',
      )}
      style={full ? { background: 'var(--cl-panel)' } : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        {tools}
        <div className="ms-auto flex items-center gap-1" role="group" aria-label="Zoom and full screen">
          <Button size="small" variant="tertiary" aria-label="Zoom out" disabled={zoom <= ZOOM_MIN} onClick={() => setZoomTo(zoom - ZOOM_STEP)}>
            −
          </Button>
          <Button size="small" variant="tertiary" aria-label="Reset zoom" onClick={() => setZoomTo(1)}>
            <span className="num">{Math.round(zoom * 100)}%</span>
          </Button>
          <Button size="small" variant="tertiary" aria-label="Zoom in" disabled={zoom >= ZOOM_MAX} onClick={() => setZoomTo(zoom + ZOOM_STEP)}>
            +
          </Button>
          <Button size="small" variant="tertiary" onClick={() => void toggleFull()}>
            {full ? 'Exit full screen' : 'Full screen'}
          </Button>
        </div>
      </div>
      {waiting ? (
        <div className="flex justify-center p-8">
          <Loader label="Loading the paper" />
        </div>
      ) : failed ? (
        <Callout tone="danger" title={file.error ?? pdfError ?? 'The paper could not be loaded.'} />
      ) : (
      <div className={cx('overflow-auto rounded-md bg-surface-2', full ? 'min-h-0 flex-1' : 'max-h-[80vh]')}>
      {/* The page box: `dir="ltr"` so coordinates are physical (see AnnotationLayer). */}
      <div
        ref={boxRef}
        dir="ltr"
        className={cx(
          'relative mx-auto select-none overflow-hidden rounded-md bg-surface-2',
          tool !== 'select' && 'touch-none',
          tool === 'eraser' ? 'cursor-cell' : tool === 'select' ? 'cursor-default' : 'cursor-crosshair',
        )}
        style={{ width: `${zoom * 100}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {doc.kind === 'image' && file.objectUrl && (
          // A `blob:` URL of bytes fetched through CORS - see `useFileBytes`.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.objectUrl} alt="The student's work" className="block h-auto w-full" draggable={false} />
        )}
        {doc.kind === 'pdf' && pdf && <PdfPage pdf={pdf} page={page} zoom={zoom} />}
        <AnnotationLayer marks={marks} pending={live} numberOf={numberOf} highlightId={highlightId} />
        {comment && (
          <form
            style={{ left: `${Math.min(comment.x, 60)}%`, top: `${comment.y}%` }}
            className="absolute z-10 flex w-[260px] flex-col gap-2 rounded-md bg-surface p-2 shadow-[0_2px_8px_var(--border-medium)]"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const text = comment.text.trim();
              if (!text) return;
              void onCreate({ page, kind: 'comment', xPercent: comment.x, yPercent: comment.y, text });
              setComment(null);
            }}
          >
            {/* The note may be Arabic: the form itself follows the text, not the page. */}
            <TextInput
              dir="auto"
              label="Comment"
              autoFocus
              maxLength={2000}
              value={comment.text}
              onChange={(e) => setComment({ ...comment, text: e.target.value })}
            />
            <div className="flex justify-end gap-2">
              <Button variant="tertiary" onClick={() => setComment(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={!comment.text.trim()}>
                Add comment
              </Button>
            </div>
          </form>
        )}
      </div>
      </div>
      )}
      {footer}
    </div>
  );
}
