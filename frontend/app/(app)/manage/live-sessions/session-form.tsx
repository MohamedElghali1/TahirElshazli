'use client';

import { useState } from 'react';
import { api, ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { LiveSession } from '@/lib/types';
import { Button, InlineBanner, Loader, Panel, Select, TextArea, TextInput } from '@/components/ui';

/** `<input type="datetime-local">`'s own format, read in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Create or edit a session (`SESS-1`). Drawn as a flat form above the table,
 * matching `manage/tasks/drafts/page.tsx`'s `DraftEditor`.
 *
 * `groupId` cannot be changed on an edit - `LiveSessionUpdate` deliberately
 * has no `groupId`: moving a session to another group is a delete and a
 * re-create, not a PATCH, because a move would strand the attendance rows
 * keyed on the session (`live-session-repository.interface.ts`).
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
    <Panel
      title={session ? 'Edit session' : 'New session'}
      action={
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <InlineBanner tone="danger">{error}</InlineBanner>}
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Title"
            className="min-w-[240px] flex-1"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
          <Select
            label="Group"
            className="w-[200px]"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            disabled={Boolean(session)}
            hint={session ? 'Fixed once created' : undefined}
            options={[
              { value: '', label: 'Choose a group' },
              ...groups.map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <TextInput
            label="Starts"
            type="datetime-local"
            className="w-[220px]"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
          <TextInput
            label="Ends"
            type="datetime-local"
            className="w-[220px]"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
          <TextInput
            label="Meeting link"
            className="min-w-[240px] flex-1"
            value={meetingLink}
            onChange={(e) => setMeetingLink(e.target.value)}
            placeholder="https://"
          />
        </div>
        <TextArea
          label="Description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
        />
        {!session && (
          <Select
            label="Visibility"
            className="w-[220px]"
            value={publishNow ? 'published' : 'planned'}
            onChange={(e) => setPublishNow(e.target.value === 'published')}
            options={[
              { value: 'published', label: 'Published now' },
              { value: 'planned', label: 'Save as draft' },
            ]}
          />
        )}
        <Button variant="primary" className="self-start" disabled={busy || !canSave} onClick={save}>
          {busy ? <Loader size={3} label="Saving" /> : 'Save session'}
        </Button>
      </div>
    </Panel>
  );
}
