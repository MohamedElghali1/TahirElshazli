'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { LiveSession } from '@/lib/types';
import { ClModal, ClSegmented } from '@/components/classroom/ui';

/** `<input type="datetime-local">`'s own format, read in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create or edit a session (`SESS-1`) — Redesign V2's "session" modal.
 *
 * `groupId` cannot be changed on an edit - `LiveSessionUpdate` deliberately
 * has no `groupId`: moving a session to another group is a delete and a
 * re-create, not a PATCH, because a move would strand the attendance rows
 * keyed on the session (`live-session-repository.interface.ts`).
 *
 * The artifact draws a date plus two times; the API takes two full instants
 * and a session may legitimately cross midnight, so Starts and Ends stay two
 * `datetime-local` fields.
 */
export function SessionForm({
  groups,
  session,
  defaultGroupId,
  onClose,
  onSaved,
}: {
  groups: ReadonlyArray<{ id: string; name: string }>;
  /** `null` for create. */
  session: LiveSession | null;
  defaultGroupId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useSession();
  const [groupId, setGroupId] = useState(session?.groupId ?? defaultGroupId ?? '');
  const [title, setTitle] = useState(session?.title ?? '');
  const [meetingLink, setMeetingLink] = useState(session?.meetingLink ?? '');
  const [scheduledAt, setScheduledAt] = useState(session ? toLocalInput(session.scheduledAt) : '');
  const [endsAt, setEndsAt] = useState(session ? toLocalInput(session.endsAt) : '');
  const [description, setDescription] = useState(session?.description ?? '');
  const [publishNow, setPublishNow] = useState(session ? session.state === 'published' : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = Boolean(groupId && title.trim() && scheduledAt && endsAt);

  async function save() {
    if (!token || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        meetingLink: meetingLink.trim() || null,
        // `datetime-local` carries no offset - `new Date(...)` reads it in the
        // browser's own timezone, and `.toISOString()` sends the real UTC
        // instant, never a bare date.
        scheduledAt: new Date(scheduledAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        description: description.trim() || null,
      };
      if (session) {
        await api.staff.sessions.update(token, session.id, body);
      } else {
        await api.staff.sessions.create(token, groupId, {
          ...body,
          state: publishNow ? 'published' : 'planned',
        });
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not save that session.');
      setBusy(false);
    }
  }

  return (
    <ClModal
      open
      title={session ? 'Edit session' : 'New session'}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cl-btnp" disabled={busy || !canSave} onClick={save}>
            {busy ? 'Saving…' : 'Save session'}
          </button>
        </>
      }
    >
      <div className="cl-fgrid">
        {error && (
          <div role="alert" className="cl-soft" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </div>
        )}
        <label className="cl-fl">
          Title
          <input className="cl-inp" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <label className="cl-fl">
          Group{session ? ' (fixed once created)' : ''}
          <select className="cl-inp" value={groupId} onChange={(e) => setGroupId(e.target.value)} disabled={Boolean(session)}>
            <option value="">Choose a group</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <div className="cl-f2">
          <label className="cl-fl">
            Starts
            <input className="cl-inp" type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <label className="cl-fl">
            Ends
            <input className="cl-inp" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
        </div>
        <label className="cl-fl">
          Meeting link
          <input className="cl-inp" value={meetingLink} onChange={(e) => setMeetingLink(e.target.value)} placeholder="https://" />
        </label>
        <label className="cl-fl">
          Description
          <textarea className="cl-inp" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
        </label>
        {!session && (
          <div>
            <div className="cl-flab">Visibility</div>
            <ClSegmented
              label="Visibility"
              value={publishNow ? 'now' : 'later'}
              onChange={(v) => setPublishNow(v === 'now')}
              options={[
                { value: 'now', label: 'Publish now' },
                { value: 'later', label: 'Save as draft' },
              ]}
            />
          </div>
        )}
      </div>
    </ClModal>
  );
}
