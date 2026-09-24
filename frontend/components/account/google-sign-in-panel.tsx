'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { goToGoogle } from '@/lib/google-flow';
import { isStaffRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import { Panel, Button, InlineBanner, Loader } from '@/components/ui';

/**
 * Connect or disconnect Google sign-in for the signed-in account (`GAUTH-1`).
 *
 * This is the only place a Google account is ever connected (`D-49`): the
 * flow starts inside this session, and the API ties the link to it. `returnTo`
 * is the screen the flow comes back to. The server decides everything shown
 * here - `available` included - and this panel only reports it.
 */
export function GoogleSignInPanel({ returnTo }: { returnTo: '/manage/account' | '/profile' }) {
  const { token, user } = useSession();
  const justConnected = useSearchParams().get('google') === 'connected';
  const { data, error, loading, reload } = useApi((t) => api.auth.googleLinkStatus(t), []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function connect() {
    if (!token) return;
    setActionError(null);
    setBusy(true);
    try {
      goToGoogle('link', await api.auth.googleLinkStart(token), returnTo);
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Could not reach Google. Please try again.');
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!token) return;
    setActionError(null);
    setBusy(true);
    try {
      await api.auth.googleUnlink(token);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Could not disconnect. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Google sign-in">
      <div className="flex flex-col gap-4">
        {loading && <Loader label="Checking Google sign-in" />}
        {error && <InlineBanner tone="danger">{error.message}</InlineBanner>}

        {data && data.linked && (
          <>
            {justConnected && <InlineBanner tone="green">Google sign-in is connected.</InlineBanner>}
            <p className="text-sm text-fg-2">
              You can sign in with <span className="text-fg">{data.email}</span>
              {data.linkedAt && <span className="text-fg-3"> · connected {formatDate(data.linkedAt)}</span>}.
              Your password still works.
            </p>
            <div>
              <Button onClick={disconnect} disabled={busy}>
                {busy ? <Loader size={3} label="Disconnecting" /> : 'Disconnect Google'}
              </Button>
            </div>
          </>
        )}

        {data && !data.linked && data.available && (
          <>
            <p className="text-sm text-fg-2">
              Connect a Google account to sign in with it as well as your password.
              {isStaffRole(user?.role) && ' Staff accounts need an address on an approved domain.'}
            </p>
            <div>
              <Button variant="primary" onClick={connect} disabled={busy}>
                {busy ? <Loader size={3} label="Opening Google" /> : 'Connect Google'}
              </Button>
            </div>
          </>
        )}

        {data && !data.linked && !data.available && (
          <p className="text-sm text-fg-3">
            {isStaffRole(user?.role)
              ? 'Google sign-in is not enabled for staff accounts on this server. Sign in with your password.'
              : 'Google sign-in is not set up on this server. Sign in with your password.'}
          </p>
        )}

        {actionError && <InlineBanner tone="danger">{actionError}</InlineBanner>}
      </div>
    </Panel>
  );
}
