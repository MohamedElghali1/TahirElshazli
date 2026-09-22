'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { Assistant, AssistantScope, Role } from '@/lib/types';
import {
  Button,
  Checkbox,
  EmptyState,
  InlineBanner,
  Loader,
  Select,
  Table,
  Tag,
  TextInput,
  type Column,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

const STATUS_TONE: Record<Assistant['status'], TagTone> = {
  invited: 'amber',
  active: 'green',
};

const ROLE_OPTIONS = [
  { value: 'assistant', label: 'Assistant' },
  { value: 'admin', label: 'Admin' },
];

const SCOPE_OPTIONS = [
  { value: 'all_groups', label: 'Every group' },
  { value: 'assigned_groups', label: 'Assigned groups only' },
];

/**
 * Assistants and admins - real accounts and pending invitations, one list
 * (`PEOPLE-4`, `AUTH-4`). The activity column links straight to the existing
 * audit log filtered to that actor (`PEOPLE-5`) - no separate route exists,
 * or needs to.
 */
export default function AssistantsPage() {
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, error, loading, reload } = useApi((token) => api.admin.assistants(token), []);
  const { data: groups } = useApi((token) => api.admin.groups(token), []);

  const columns: Column<Assistant>[] = [
    { label: 'Name', render: (a) => a.name },
    { label: 'Email', render: (a) => a.email },
    {
      label: 'Role',
      render: (a) => <Tag tone={a.role === 'admin' ? 'violet' : 'gray'}>{a.role}</Tag>,
    },
    {
      label: 'Status',
      render: (a) => <Tag tone={STATUS_TONE[a.status]}>{a.status}</Tag>,
    },
    {
      label: 'Reach',
      render: (a) =>
        a.scope === 'all_groups'
          ? 'Every group'
          : `${a.groupIds.length} group${a.groupIds.length === 1 ? '' : 's'}`,
    },
    {
      label: 'Last active',
      render: (a) =>
        a.lastSeenAt ? (
          <Link
            href={`/manage/activity?actorId=${a.id}`}
            className="text-fg-3 underline-offset-4 hover:underline"
          >
            {formatDate(a.lastSeenAt)}
          </Link>
        ) : (
          '—'
        ),
    },
    {
      label: '',
      align: 'end',
      render: (a) => (
        <Button size="small" onClick={() => setEditingId(a.id)}>
          Edit
        </Button>
      ),
    },
  ];

  const editing = data?.find((a) => a.id === editingId) ?? null;

  return (
    <>
      <PageTitle title="Assistants" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => setInviting((v) => !v)}>
            {inviting ? 'Cancel' : 'Invite assistant'}
          </Button>
        </div>

        {inviting && groups && (
          <InvitePanel
            groups={groups}
            onClose={() => setInviting(false)}
            onInvited={() => {
              setInviting(false);
              reload();
            }}
          />
        )}

        {editing && groups && (
          <EditPanel
            assistant={editing}
            groups={groups}
            onClose={() => setEditingId(null)}
            onChanged={() => {
              setEditingId(null);
              reload();
            }}
          />
        )}

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading assistants" />
          </div>
        )}
        {error && (
          <EmptyState
            icon="AlertTriangle"
            title={error.message}
            action={<Button onClick={reload}>Try again</Button>}
          />
        )}
        {data && data.length === 0 && (
          <EmptyState
            icon="Users"
            title="No assistants yet"
            description="Invite an assistant or admin to help run the course."
          />
        )}
        {data && data.length > 0 && (
          <Table columns={columns} rows={data} rowKey={(a) => a.id} />
        )}
      </div>
    </>
  );
}

/** The `scope`/`groupIds` fields, shared by the invite and edit forms. */
function ReachFields({
  role,
  scope,
  setScope,
  groupIds,
  setGroupIds,
  groups,
}: {
  role: string;
  scope: AssistantScope;
  setScope: (s: AssistantScope) => void;
  groupIds: string[];
  setGroupIds: (ids: string[]) => void;
  groups: readonly { id: string; name: string }[];
}) {
  if (role === 'admin') return null;
  return (
    <>
      <Select
        label="Reach"
        className="w-[240px]"
        value={scope}
        onChange={(e) => setScope(e.target.value as AssistantScope)}
        options={SCOPE_OPTIONS}
      />
      {scope === 'assigned_groups' && (
        <div className="flex flex-col gap-2">
          <p className="text-base text-fg-3">Groups</p>
          <div className="flex flex-wrap gap-3">
            {groups.map((g) => (
              <Checkbox
                key={g.id}
                label={g.name}
                checked={groupIds.includes(g.id)}
                onChange={(checked) =>
                  setGroupIds(
                    checked ? [...groupIds, g.id] : groupIds.filter((id) => id !== g.id),
                  )
                }
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function InvitePanel({
  groups,
  onClose,
  onInvited,
}: {
  groups: readonly { id: string; name: string }[];
  onClose: () => void;
  onInvited: () => void;
}) {
  const { token } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('assistant');
  const [scope, setScope] = useState<AssistantScope>('all_groups');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.inviteAssistant(token, {
        name: name.trim(),
        email: email.trim(),
        role,
        scope,
        groupIds: role === 'admin' ? [] : groupIds,
      });
      onInvited();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not send this invitation.');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-2 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-fg">Invite an assistant</p>
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      </div>

      {error && <InlineBanner tone="danger">{error}</InlineBanner>}

      <div className="flex flex-wrap items-end gap-3">
        <TextInput
          label="Full name"
          className="min-w-[220px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextInput
          label="Email"
          type="email"
          className="min-w-[220px]"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Select
          label="Role"
          className="w-[160px]"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={ROLE_OPTIONS}
        />
      </div>

      <ReachFields
        role={role}
        scope={scope}
        setScope={setScope}
        groupIds={groupIds}
        setGroupIds={setGroupIds}
        groups={groups}
      />

      <Button
        type="submit"
        variant="primary"
        disabled={busy || !name.trim() || !email.trim()}
        className="self-start"
      >
        {busy ? 'Sending…' : 'Send invitation'}
      </Button>
    </form>
  );
}

/**
 * Edits scope/groupIds on a real account, or on a still-pending invitation -
 * `PATCH /admin/assistants/:id` handles both (`AdminAssistantsService`).
 * Resend and cancel are offered on the invited row only - an active account
 * is never removed here, see the backend service's own comment.
 */
function EditPanel({
  assistant,
  groups,
  onClose,
  onChanged,
}: {
  assistant: Assistant;
  groups: readonly { id: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { token } = useSession();
  const [scope, setScope] = useState<AssistantScope>(assistant.scope);
  const [groupIds, setGroupIds] = useState<string[]>(assistant.groupIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function save() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.updateAssistant(token, assistant.id, {
        name: assistant.name,
        email: assistant.email,
        role: assistant.role,
        scope,
        groupIds: assistant.role === 'admin' ? [] : groupIds,
      });
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save this change.');
      setBusy(false);
    }
  }

  async function resend() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.resendAssistantInvitation(token, assistant.id);
      setNotice('Invitation resent.');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not resend this invitation.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.removeAssistant(token, assistant.id);
      onChanged();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not cancel this invitation.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-fg">
          {assistant.name} <span className="text-fg-3">· {assistant.email}</span>
        </p>
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      </div>

      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      {notice && !error && <InlineBanner tone="green">{notice}</InlineBanner>}

      <ReachFields
        role={assistant.role}
        scope={scope}
        setScope={setScope}
        groupIds={groupIds}
        setGroupIds={setGroupIds}
        groups={groups}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>
          Save
        </Button>
        {assistant.status === 'invited' && (
          <>
            <Button disabled={busy} onClick={() => void resend()}>
              Resend invitation
            </Button>
            <Button accent="danger" disabled={busy} onClick={() => void cancel()}>
              Cancel invitation
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
