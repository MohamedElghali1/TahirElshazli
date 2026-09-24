'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { resolvePostAuthPath } from '@/lib/roles';
import { takePendingGoogleFlow } from '@/lib/google-flow';
import { Loader, InlineBanner } from '@/components/ui';

/** The only places a link flow returns to; anything else in storage is ignored. */
const LINK_RETURNS = new Set(['/manage/account', '/profile']);

/**
 * Where Google sends the browser back (`GAUTH-1`) - the sign-in redirect URI.
 *
 * It holds no decision of its own: it hands Google's `code` and `state`, plus
 * the `browserKey` this tab kept, to the API, which verifies all three and the
 * `id_token` before anything happens. A refusal is shown as the API worded it.
 */
export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={null}>
      <GoogleCallback />
    </Suspense>
  );
}

function GoogleCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { token, loading, signInWithGoogle } = useSession();
  const [error, setError] = useState<{ message: string; mode: 'sign-in' | 'link'; back: string } | null>(null);
  // The pending flow is read once and then forgotten, so React's development
  // double-invoke must not run this twice.
  const started = useRef(false);

  useEffect(() => {
    // A link needs the session; wait for it to be read from storage.
    if (loading || started.current) return;
    started.current = true;

    void (async () => {
      const pending = takePendingGoogleFlow();
      const mode = pending?.mode ?? 'sign-in';
      const linkBack =
        pending?.returnTo && LINK_RETURNS.has(pending.returnTo) ? pending.returnTo : '/profile';
      const back = mode === 'link' ? linkBack : '/login';
      const code = params.get('code');
      const state = params.get('state');

      if (params.get('error')) {
        // `access_denied` when someone backs out at Google - an outcome, not a fault.
        setError({ mode, back, message: 'Google sign-in was cancelled. Nothing has changed.' });
        return;
      }
      if (!pending) {
        setError({
          mode,
          back,
          message: 'This Google sign-in was started in another tab or has expired. Start again.',
        });
        return;
      }
      if (!code || !state) {
        setError({ mode, back, message: 'Google did not send the expected details back. Start again.' });
        return;
      }

      const completion = { code, state, browserKey: pending.browserKey };
      try {
        if (pending.mode === 'sign-in') {
          const account = await signInWithGoogle(completion);
          router.replace(resolvePostAuthPath(account.role, pending.returnTo));
        } else {
          if (!token) {
            setError({ mode, back, message: 'Your session ended before Google finished. Sign in and connect again.' });
            return;
          }
          await api.auth.googleLink(token, completion);
          router.replace(`${linkBack}?google=connected`);
        }
      } catch (cause) {
        setError({
          mode,
          back,
          message: cause instanceof ApiError ? cause.message : 'Could not reach the server. Please try again.',
        });
      }
    })();
  }, [loading, params, router, signInWithGoogle, token]);

  if (!error) {
    return (
      <div className="flex justify-center py-12">
        <Loader label="Finishing Google sign-in" />
      </div>
    );
  }

  return (
    <>
      <h1 className="text-(length:--fs-h2) font-semibold tracking-[-0.02em] text-fg">
        {error.mode === 'link' ? 'Google was not connected' : 'Google sign-in did not finish'}
      </h1>
      <div className="mt-6">
        <InlineBanner tone="danger">{error.message}</InlineBanner>
      </div>
      <Link
        href={error.back}
        className="mt-8 inline-block text-(length:--fs-base) text-fg-2 underline underline-offset-4 hover:text-fg"
      >
        {error.mode === 'link' ? 'Back to your account' : 'Back to sign in'}
      </Link>
    </>
  );
}
