'use client';

import { useEffect, useState } from 'react';
import { mediaSrc } from '@/lib/api';

export interface FileBytes {
  /** The raw bytes - what pdf.js reads. */
  bytes: ArrayBuffer | null;
  /** A same-origin `blob:` URL for an `<img>`. Revoked on unmount. */
  objectUrl: string | null;
  error: string | null;
  loading: boolean;
}

/**
 * A platform-stored file, fetched as bytes through a **CORS** request and
 * shown from a local object URL.
 *
 * Why not `<img src={mediaSrc(url)}>`: the API answers every response,
 * `/uploads/*` included, with helmet's `Cross-Origin-Resource-Policy:
 * same-origin`, and the web app is a different origin (unit-7 plan, Risk 2;
 * checked with `curl -I` on 2026-09-23). A no-cors image load from the web
 * app is therefore blocked by the browser. A CORS fetch is not subject to
 * CORP, and the API's CORS allow-list already names the web origin. This
 * keeps the security header as it is rather than relaxing it for one screen.
 *
 * `/uploads/*` needs no token (`SECURITY.md` §4, a known limitation), so none
 * is sent - the bearer token never travels to a file URL.
 */
export function useFileBytes(url: string | null): FileBytes {
  // Keyed by the URL it answers, so a new URL reads as loading without a
  // synchronous reset inside the effect.
  const [result, setResult] = useState<{
    url: string;
    bytes: ArrayBuffer | null;
    objectUrl: string | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    fetch(mediaSrc(url), { mode: 'cors', credentials: 'omit', signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`The file could not be loaded (${res.status}).`);
        const blob = await res.blob();
        const bytes = await blob.arrayBuffer();
        objectUrl = URL.createObjectURL(blob);
        setResult({ url, bytes, objectUrl, error: null });
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setResult({
          url,
          bytes: null,
          objectUrl: null,
          error: cause instanceof Error ? cause.message : 'The file could not be loaded.',
        });
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!url) return { bytes: null, objectUrl: null, error: null, loading: false };
  if (result?.url !== url) return { bytes: null, objectUrl: null, error: null, loading: true };
  return { bytes: result.bytes, objectUrl: result.objectUrl, error: result.error, loading: false };
}
