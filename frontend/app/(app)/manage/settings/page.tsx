'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import type { NotificationPreferences } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClEmpty, ClError, ClSkeleton, ClTabs, PanelHead } from '@/components/classroom/ui';
import { formatDate } from '@/lib/format';

/**
 * Staff settings, Redesign V2 "SETTINGS": a row per preference with a switch.
 * Saving stays explicit (one PATCH of all four), so the button stays.
 */
export default function SettingsPage() {
  const { user } = useSession();
  const isAdmin = isAdminRole(user?.role);

  const tabs = [
    { value: 'notifications', label: 'Notifications' },
    ...(isAdmin ? [{ value: 'google', label: 'Google integration' }] : []),
  ];

  const [activeTab, setActiveTab] = useState(tabs[0].value);

  return (
    <>
      <PageTitle title="Settings" />
      <ClTabs tabs={tabs} value={activeTab} onChange={setActiveTab} label="Settings categories" />
      {activeTab === 'notifications' && <NotificationsTab />}
      {activeTab === 'google' && isAdmin && <GoogleTab />}
    </>
  );
}

const PREFS = [
  { key: 'submissions', title: 'Submissions', hint: 'An email when a student hands in work.' },
  { key: 'registrations', title: 'Registrations', hint: 'An email when someone registers.' },
  { key: 'unmatched', title: 'Unmatched responses', hint: 'An email when a Google Form response matches no student.' },
  { key: 'weeklySummary', title: 'Weekly summary', hint: 'One email a week with the state of your groups.' },
] as const;

type PrefKey = (typeof PREFS)[number]['key'];

function NotificationsTab() {
  const { data, error, loading, reload } = useApi((t) => api.staff.notificationPreferences(t), []);

  if (loading && !data) {
    return (
      <section className="cl-panel">
        <ClSkeleton rows={4} label="Loading preferences" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="cl-panel">
        <ClError message={error.message} onRetry={reload} />
      </section>
    );
  }
  if (!data) return null;
  return <PrefsForm initial={data} onSaved={reload} />;
}

function PrefsForm({ initial, onSaved }: { initial: NotificationPreferences; onSaved: () => void }) {
  const { token } = useSession();
  const [prefs, setPrefs] = useState<Record<PrefKey, boolean>>({
    submissions: initial.submissions,
    registrations: initial.registrations,
    unmatched: initial.unmatched,
    weeklySummary: initial.weeklySummary,
  });
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token) return;
    setSaveError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.staff.updateNotificationPreferences(token, prefs);
      setSaved(true);
      onSaved();
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : 'Could not save preferences.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="st-n" className="cl-panel">
      <PanelHead id="st-n" title="Email notifications" />
      <form onSubmit={submit}>
        {PREFS.map((p) => (
          <div key={p.key} className="cl-grow">
            <span className="cl-grow-main">
              <span id={`pref-${p.key}`} className="block">
                {p.title}
              </span>
              <span className="cl-sub">{p.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={prefs[p.key]}
              aria-labelledby={`pref-${p.key}`}
              className="cl-sw"
              onClick={() => setPrefs((s) => ({ ...s, [p.key]: !s[p.key] }))}
            >
              <span />
            </button>
          </div>
        ))}
        {saveError && <ClError message={saveError} />}
        <div className="mt-4 flex items-center justify-end gap-3">
          {saved && (
            <span role="status" className="text-[13px]" style={{ color: 'var(--cl-ok)' }}>
              Saved
            </span>
          )}
          <button type="submit" className="cl-btnp" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </section>
  );
}

function GoogleTab() {
  const { token } = useSession();
  const { data, error, loading, reload } = useApi((t) => api.admin.googleIntegration.status(t), []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading && !data) {
    return (
      <section className="cl-panel">
        <ClSkeleton rows={2} label="Loading status" />
      </section>
    );
  }
  if (error) {
    return (
      <section className="cl-panel">
        <ClError message={error.message} onRetry={reload} />
      </section>
    );
  }
  if (!data) return null;

  async function connect() {
    if (!token) return;
    setActionError(null);
    setBusy(true);
    try {
      const { authUrl } = await api.admin.googleIntegration.connect(token);
      window.location.href = authUrl;
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Failed to start connection.');
      setBusy(false);
    }
  }

  async function disconnect() {
    if (!token) return;
    if (!confirm('Disconnect this Google account? Form integration will stop working.')) return;
    setActionError(null);
    setBusy(true);
    try {
      await api.admin.googleIntegration.disconnect(token);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Failed to disconnect.');
    } finally {
      setBusy(false);
    }
  }

  if (!data.isConfigured) {
    return (
      <section className="cl-panel">
        <PanelHead title="Google Workspace" />
        <ClEmpty
          icon="settings"
          tone="cl-tone-blue"
          title="Not configured"
          hint="The server is missing Google OAuth credentials. Check the deployment documentation to enable Google Forms integration."
        />
      </section>
    );
  }

  return (
    <section aria-labelledby="st-g" className="cl-panel">
      <PanelHead id="st-g" title="Google Workspace" />
      {data.isConnected ? (
        <>
          <p className="cl-muted m-0 px-2 text-[14px]">
            Connected as <strong className="text-fg">{data.googleEmail}</strong> on{' '}
            {data.connectedAt ? formatDate(data.connectedAt) : 'an unknown date'}.
          </p>
          {data.lastError && (
            <p className="m-0 mt-3 px-2 text-[14px]" style={{ color: 'var(--cl-bad)' }}>
              Last sync error: {data.lastError}
            </p>
          )}
          {actionError && <ClError message={actionError} />}
          <div className="mt-4 flex justify-end">
            <button type="button" className="cl-btns" onClick={() => void disconnect()} disabled={busy}>
              {busy ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="cl-muted m-0 px-2 text-[14px]">
            Connect a Google Workspace account to sync Google Forms responses and grades.
          </p>
          {actionError && <ClError message={actionError} />}
          <div className="mt-4 flex justify-end">
            <button type="button" className="cl-btnp" onClick={() => void connect()} disabled={busy}>
              {busy ? 'Connecting…' : 'Connect account'}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
