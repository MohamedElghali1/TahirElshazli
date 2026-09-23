'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { Panel, EmptyState, Loader, Button, InlineBanner, TabList} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { formatDate } from '@/lib/format';

export default function SettingsPage() {
  const { user } = useSession();
  const isAdmin = isAdminRole(user?.role);
  
  const tabs = [
    { value: 'notifications', label: 'Notifications' },
    ...(isAdmin ? [{ value: 'google', label: 'Google Integration' }] : []),
  ];
  
  const [activeTab, setActiveTab] = useState(tabs[0].value);

  return (
    <>
      <PageTitle title="Settings" />
      <div className="p-6">
        <TabList tabs={tabs} value={activeTab} onChange={(v: string) => setActiveTab(v)} label="Settings categories" />
        <div className="mt-6 xl:w-1/2">
          {activeTab === 'notifications' && <NotificationsTab />}
          {activeTab === 'google' && isAdmin && <GoogleTab />}
        </div>
      </div>
    </>
  );
}

function NotificationsTab() {
  const { token } = useSession();
  const { data, error, loading, reload } = useApi((t) => api.staff.notificationPreferences(t), []);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (loading) return <Loader label="Loading preferences" />;
  if (error) return <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />;
  if (!data) return null;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);

    setSaveError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api.staff.updateNotificationPreferences(token, {
        submissions: form.get('submissions') === 'on',
        registrations: form.get('registrations') === 'on',
        unmatched: form.get('unmatched') === 'on',
        weeklySummary: form.get('weeklySummary') === 'on',
      });
      setSaved(true);
      reload();
    } catch (cause) {
      setSaveError(cause instanceof ApiError ? cause.message : 'Could not save preferences.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Email Notifications">
      <form onSubmit={submit} className="flex flex-col gap-6">
        <label className="flex items-center gap-2 text-14 font-medium text-fg">
          <input type="checkbox" name="submissions" defaultChecked={data.submissions} /> Submissions
        </label>
        <label className="flex items-center gap-2 text-14 font-medium text-fg">
          <input type="checkbox" name="registrations" defaultChecked={data.registrations} /> Registrations
        </label>
        <label className="flex items-center gap-2 text-14 font-medium text-fg">
          <input type="checkbox" name="unmatched" defaultChecked={data.unmatched} /> Unmatched Responses
        </label>
        <label className="flex items-center gap-2 text-14 font-medium text-fg">
          <input type="checkbox" name="weeklySummary" defaultChecked={data.weeklySummary} /> Weekly Summary
        </label>

        {saveError && <InlineBanner tone="danger">{saveError}</InlineBanner>}

        <div className="flex items-center justify-end gap-3 border-t border-border-light pt-4">
          {saved && <span className="text-xs text-status-green-text">Saved</span>}
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? <Loader size={3} label="Saving" /> : 'Save changes'}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function GoogleTab() {
  const { token } = useSession();
  const { data, error, loading, reload } = useApi((t) => api.admin.googleIntegration.status(t), []);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading) return <Loader label="Loading status" />;
  if (error) return <EmptyState icon="AlertTriangle" title={error.message} action={<Button onClick={reload}>Try again</Button>} />;
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
      <Panel title="Google Workspace">
        <EmptyState
          icon="Settings"
          title="Not Configured"
          description="The server is missing Google OAuth credentials. Check the deployment documentation to enable Google Forms integration."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Google Workspace">
      <div className="flex flex-col gap-4">
        {data.isConnected ? (
          <>
            <p className="text-sm text-fg-2">
              Connected as <strong>{data.googleEmail}</strong> on {data.connectedAt ? formatDate(data.connectedAt) : 'an unknown date'}.
            </p>
            {data.lastError && (
              <InlineBanner tone="danger">
                Last sync error: {data.lastError}
              </InlineBanner>
            )}
            <div className="border-t border-border-light pt-4 flex justify-end">
              <Button variant="secondary" accent="danger" onClick={disconnect} disabled={busy}>
                {busy ? <Loader size={3} label="Disconnecting" /> : 'Disconnect'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-fg-2">
              Connect a Google Workspace account to sync Google Forms responses and grades.
            </p>
            {actionError && <InlineBanner tone="danger">{actionError}</InlineBanner>}
            <div className="border-t border-border-light pt-4 flex justify-end">
              <Button variant="primary" onClick={connect} disabled={busy}>
                {busy ? <Loader size={3} label="Connecting" /> : 'Connect Account'}
              </Button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
