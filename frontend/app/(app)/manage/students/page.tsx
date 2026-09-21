'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StudentDirectoryEntry, UserStatus } from '@/lib/types';
import {
  Button,
  EmptyState,
  InlineBanner,
  Loader,
  SearchInput,
  Select,
  Table,
  Tag,
  TextArea,
  TextInput,
  type Column,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

const STATUS_TONE: Record<UserStatus, TagTone> = {
  waiting: 'amber',
  active: 'green',
  rejected: 'red',
};

const STATUS_LABEL: Record<UserStatus, string> = {
  waiting: 'Waiting',
  active: 'Active',
  rejected: 'Rejected',
};

const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'active', label: 'Active' },
  { value: 'rejected', label: 'Rejected' },
];

/**
 * The student directory, including the registration queue (`PEOPLE-1`,
 * `DOM-4`). Admin only - CLAUDE.md §2.2 puts the full directory under the
 * teacher and gives a TA a per-course roster instead.
 *
 * The backend and `lib/` mirror already carried accept/reject
 * (`registration-approval.service.ts`) - this screen was the only piece that
 * hadn't caught up since unit 4's mechanical port.
 */
export default function StudentDirectoryPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, error, loading, reload } = useApi(
    (token) => api.admin.students(token, search.trim() || undefined, status || undefined),
    [search, status],
  );

  const { data: groups } = useApi((token) => api.admin.groups(token), []);

  const columns: Column<StudentDirectoryEntry>[] = [
    {
      label: 'Name',
      render: (student) => (
        <Link
          href={`/manage/students/${student.id}`}
          className="text-fg underline-offset-4 hover:underline"
        >
          {student.name}
        </Link>
      ),
    },
    { label: 'Email', render: (student) => student.email },
    {
      label: 'Status',
      render: (student) => (
        <Tag tone={STATUS_TONE[student.status]}>{STATUS_LABEL[student.status]}</Tag>
      ),
    },
    {
      label: 'Courses',
      align: 'end',
      render: (student) => <span className="num">{student.enrolledCourseCount}</span>,
    },
    {
      label: 'Joined',
      align: 'end',
      render: (student) => formatDate(student.createdAt),
    },
    {
      label: '',
      align: 'end',
      render: (student) =>
        student.status === 'waiting' ? (
          <Button size="small" onClick={() => setDecidingId(student.id)}>
            Decide
          </Button>
        ) : null,
    },
  ];

  const decidingStudent = data?.find((s) => s.id === decidingId) ?? null;

  return (
    <>
      <PageTitle title="Students" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <SearchInput
              label="Search students"
              className="max-w-[360px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select
              label="Status"
              className="w-[160px]"
              value={status}
              onChange={(e) => setStatus(e.target.value as UserStatus | '')}
              options={STATUS_FILTER_OPTIONS}
            />
          </div>
          <Button variant="primary" onClick={() => setCreating((v) => !v)}>
            {creating ? 'Cancel' : 'Create student'}
          </Button>
        </div>

        {creating && (
          <CreatePanel
            onClose={() => setCreating(false)}
            onCreated={() => {
              setCreating(false);
              reload();
            }}
          />
        )}

        {decidingStudent && groups && (
          <DecisionPanel
            student={decidingStudent}
            groups={groups}
            onClose={() => setDecidingId(null)}
            onDecided={() => {
              setDecidingId(null);
              reload();
            }}
          />
        )}

        {loading && (
          <div className="flex justify-center p-8">
            <Loader label="Loading students" />
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
            title={search || status ? 'No matches' : 'No students yet'}
            description={
              search || status
                ? 'No student account matches that filter.'
                : 'Students who register will be listed here.'
            }
          />
        )}
        {data && data.length > 0 && (
          <Table columns={columns} rows={data} rowKey={(student) => student.id} />
        )}
      </div>
    </>
  );
}

/**
 * Accept or reject one waiting registration. Accept needs a group - the group
 * decides the course (`registration-approval.service.ts`), so there is no
 * separate course field here. No `Modal` primitive exists yet
 * (`redesign-mapping.md` decision 4 is unbuilt), so this is an inline panel
 * rather than an overlay - the smallest correct thing given what's available.
 */
function DecisionPanel({
  student,
  groups,
  onClose,
  onDecided,
}: {
  student: StudentDirectoryEntry;
  groups: readonly { id: string; name: string }[];
  onClose: () => void;
  onDecided: () => void;
}) {
  const { token } = useSession();
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!token || !groupId) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.acceptRegistration(token, student.id, groupId);
      onDecided();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not accept this registration.');
      setBusy(false);
    }
  }

  async function reject() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.rejectRegistration(token, student.id, reason.trim() || undefined);
      onDecided();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reject this registration.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-fg">
          {student.name} <span className="text-fg-3">· {student.email}</span>
        </p>
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      </div>

      {error && <InlineBanner tone="danger">{error}</InlineBanner>}

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label="Place in group"
          className="w-[240px]"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
        />
        <Button variant="primary" disabled={busy || !groupId} onClick={() => void accept()}>
          Accept
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <TextArea
          label="Rejection reason (optional)"
          className="min-w-[240px] flex-1"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
        />
        <Button accent="danger" disabled={busy} onClick={() => void reject()}>
          Reject
        </Button>
      </div>
    </div>
  );
}

/**
 * Creates a student directly, already active - no password, a sign-in link
 * is emailed instead (`PEOPLE-3`). Same inline-panel shape as `DecisionPanel`,
 * for the same reason: no `Modal` primitive exists yet.
 */
function CreatePanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { token } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.createStudent(token, { name: name.trim(), email: email.trim() });
      onCreated();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not create this student.');
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 rounded-lg border border-border-light bg-surface-2 p-4"
    >
      <div className="flex items-center justify-between">
        <p className="text-base font-medium text-fg">Create a student</p>
        <Button size="small" variant="tertiary" onClick={onClose}>
          Close
        </Button>
      </div>

      {error && <InlineBanner tone="danger">{error}</InlineBanner>}
      <p className="text-base text-fg-3">
        Creates an active account immediately and emails a sign-in link - no approval queue.
      </p>

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
        <Button type="submit" variant="primary" disabled={busy || !name.trim() || !email.trim()}>
          {busy ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </form>
  );
}
