import type { GoogleStart } from './types';

/**
 * The half of a Google sign-in or link that has to survive the round trip to
 * Google (`GAUTH-1`): which flow this is, where to land afterwards, and the
 * `browserKey` the API issued. The key proves to the API that the browser
 * finishing the flow is the one that started it, so it lives in this tab's
 * `sessionStorage` and never in a URL - the same storage the session token uses
 * (`session.tsx`), and cleared the moment it is read.
 */
export type GoogleFlowMode = 'sign-in' | 'link';

interface PendingGoogleFlow {
  mode: GoogleFlowMode;
  browserKey: string;
  /** Where to go once it completes: `next` for a sign-in, the account screen for a link. */
  returnTo: string | null;
}

const KEY = 'te.google-flow';

/** Remembers the flow, then leaves for Google. */
export function goToGoogle(mode: GoogleFlowMode, start: GoogleStart, returnTo: string | null): void {
  const pending: PendingGoogleFlow = { mode, browserKey: start.browserKey, returnTo };
  sessionStorage.setItem(KEY, JSON.stringify(pending));
  window.location.assign(start.authUrl);
}

/** Reads and forgets the pending flow. Null when this tab did not start one. */
export function takePendingGoogleFlow(): PendingGoogleFlow | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingGoogleFlow>;
    if ((parsed.mode === 'sign-in' || parsed.mode === 'link') && typeof parsed.browserKey === 'string') {
      return { mode: parsed.mode, browserKey: parsed.browserKey, returnTo: parsed.returnTo ?? null };
    }
    return null;
  } catch {
    return null;
  }
}
