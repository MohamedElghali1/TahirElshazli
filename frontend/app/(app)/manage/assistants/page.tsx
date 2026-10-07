'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { Assistant, AssistantScope, Role } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon, initialsOf } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClModal, ClSkeleton, PanelHead, useToast } from '@/components/classroom/ui';

/**
 * Assistants and admins - real accounts and pending invitations, one list
 * (`PEOPLE-4`, `AUTH-4`). Redesign V2, the artifact's ASSISTANTS: a row per
 * person with their reach, "Add assistant" and Edit in a modal. The "last
 * active" date links straight to the audit log filtered to that actor
 * (`PEOPLE-5`) - no separate route exists, or needs to.
 */
export default function AssistantsPage() {
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, flash] = useToast();

  const { data, error, loading, reload } = useApi((token) => api.admin.assistants(token), []);
  const { data: groups } = useApi((token) => api.admin.groups(token), []);

  const editing = data?.find((a) => a.id === editingId) ?? null;
  const groupName = new Map((groups ?? []).map((g) => [g.id, g.name]));

  return (
    <>
      <PageTitle title="Assistants" />
      <section aria-labelledby="as-h" className="cl-panel pb-4">
        <PanelHead id="as-h" title="Assistants" className="mb-2">
          <button type="button" className="cl-btnp" onClick={() => setInviting(true)}>
            <ClIcon name="plus" small />
            Add assistant
          </button>
        </PanelHead>

        {loading && !data && !error && <ClSkeleton rows={3} label="Loading assistants" />}
        {error && (
          <ClError
            message={error.isAuth ? "You don't have access to this page." : error.message}
            onRetry={error.isAuth ? undefined : reload}
          />
        )}
        {data && data.length === 0 && (
          <ClEmpty
            icon="assistants"
            tone="cl-tone-blue"
            title="No assistants yet"
            hint="Invite an assistant or admin to help run the course."
          />
        )}
        {data?.map((a) => (
          <div key={a.id} className="cl-grow flex-wrap" style={{ cursor: 'default' }}>
            <span className="cl-ic40 cl-tone-peach">{initialsOf(a.name)}</span>
            <span className="cl-grow-main min-w-[200px]">
              <span className="block truncate">{a.name}</span>
              <span className="cl-sub block truncate">
                {a.role === 'admin' ? 'Admin' : 'Assistant'} · {a.email}
                {a.status === 'invited' && ' · Invitation pending'}
              </span>
            </span>
            <span className="min-w-[150px] text-[13.5px]">
              <span className="cl-muted block text-[12px]">Assigned groups</span>
              {a.role === 'admin' || a.scope === 'all_groups'
                ? 'Every group'
                : a.groupIds.length === 0
                  ? '—'
                  : a.groupIds.map((id) => groupName.get(id) ?? 'Group').join(', ')}
            </span>
            <span className="cl-muted min-w-[110px] text-[13px] max-sm:hidden">
              {a.lastSeenAt ? (
                <Link href={`/manage/activity?actorId=${a.id}`} className="cl-glink">
                  Active {formatDate(a.lastSeenAt)}
                </Link>
              ) : (
                '—'
              )}
            </span>
            <button type="button" className="cl-btns" onClick={() => setEditingId(a.id)}>
              Edit
            </button>
          </div>
        ))}
      </section>

      {inviting && groups && (
        <InviteModal
          groups={groups}
          onClose={() => setInviting(false)}
          onInvited={() => {
            setInviting(false);
            flash('Invitation sent');
            reload();
          }}
        />
      )}
      {editing && groups && (
        <EditModal
          assistant={editing}
          groups={groups}
          onClose={() => setEditingId(null)}
          onChanged={(message) => {
            setEditingId(null);
            flash(message);
            reload();
          }}
        />
      )}
      {toast}
    </>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="cl-soft m-0" style={{ color: 'var(--cl-bad)' }}>
      {message}
    </p>
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
      <label className="cl-fl">
        Reach
        <select className="cl-inp" value={scope} onChange={(e) => setScope(e.target.value as AssistantScope)}>
          <option value="all_groups">Every group</option>
          <option value="assigned_groups">Assigned groups only</option>
        </select>
      </label>
      {scope === 'assigned_groups' && (
        <div>
          <div className="cl-flab">Groups</div>
          <div className="cl-chips" role="group" aria-label="Groups">
            {groups.map((g) => {
              const on = groupIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  className={on ? 'cl-chip on' : 'cl-chip'}
                  onClick={() => setGroupIds(on ? groupIds.filter((id) => id !== g.id) : [...groupIds, g.id])}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

function InviteModal({
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
    <ClModal
      open
      title="Add assistant"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="invite-form" className="cl-btnp" disabled={busy || !name.trim() || !email.trim()}>
            {busy ? 'Sending…' : 'Send invitation'}
          </button>
        </>
      }
    >
      <form id="invite-form" onSubmit={submit} className="cl-fgrid">
        {error && <ErrorLine message={error} />}
        <div className="cl-f2">
          <label className="cl-fl">
            Full name
            <input className="cl-inp" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="cl-fl">
            Email
            <input className="cl-inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
        </div>
        <label className="cl-fl">
          Role
          <select className="cl-inp" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="assistant">Assistant</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <ReachFields
          role={role}
          scope={scope}
          setScope={setScope}
          groupIds={groupIds}
          setGroupIds={setGroupIds}
          groups={groups}
        />
      </form>
    </ClModal>
  );
}

/**
 * Edits scope/groupIds on a real account, or on a still-pending invitation -
 * `PATCH /admin/assistants/:id` handles both (`AdminAssistantsService`).
 * Resend and cancel are offered on the invited row only - an active account
 * is never removed here, see the backend service's own comment.
 */
function EditModal({
  assistant,
  groups,
  onClose,
  onChanged,
}: {
  assistant: Assistant;
  groups: readonly { id: string; name: string }[];
  onClose: () => void;
  onChanged: (message: string) => void;
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
      onChanged('Changes saved');
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
      onChanged('Invitation cancelled');
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not cancel this invitation.');
      setBusy(false);
    }
  }

  return (
    <ClModal
      open
      title={assistant.name}
      onClose={onClose}
      footer={
        <>
          {assistant.status === 'invited' && (
            <>
              <button type="button" className="cl-glink cl-glink--danger me-auto" disabled={busy} onClick={() => void cancel()}>
                Cancel invitation
              </button>
              <button type="button" className="cl-btns" disabled={busy} onClick={() => void resend()}>
                Resend invitation
              </button>
            </>
          )}
          <button type="button" className="cl-btns" onClick={onClose}>
            Close
          </button>
          <button type="button" className="cl-btnp" disabled={busy} onClick={() => void save()}>
            Save changes
          </button>
        </>
      }
    >
      <div className="cl-fgrid">
        {error && <ErrorLine message={error} />}
        {notice && !error && (
          <p role="status" className="cl-soft m-0" style={{ color: 'var(--cl-ok)' }}>
            {notice}
          </p>
        )}
        <p className="cl-muted m-0 text-[13.5px]">
          {assistant.role === 'admin' ? 'Admin' : 'Assistant'} · {assistant.email}
        </p>
        {assistant.role === 'admin' && (
          <p className="cl-muted m-0 text-[13.5px]">Admins reach every group; there is nothing to scope.</p>
        )}
        <ReachFields
          role={assistant.role}
          scope={scope}
          setScope={setScope}
          groupIds={groupIds}
          setGroupIds={setGroupIds}
          groups={groups}
        />
      </div>
    </ClModal>
  );
}
