'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, mediaSrc } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate } from '@/lib/format';
import type { StudentDirectoryEntry, UserStatus } from '@/lib/types';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon, initialsOf } from '@/components/shell/classroom';
import { ClEmpty, ClError, ClModal, ClSkeleton, ClTabs, PanelHead, useToast } from '@/components/classroom/ui';

type View = UserStatus | 'all';

const STATUS_LABEL: Record<UserStatus, string> = {
  waiting: 'Waiting',
  active: 'Active',
  rejected: 'Rejected',
};

const TABS = [
  { value: 'active', label: 'Active' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
] as const;

const COLS = '2.4fr 0.9fr 0.7fr 1fr 1.1fr';

/**
 * The student directory, including the registration queue (`PEOPLE-1`,
 * `DOM-4`). Admin only - CLAUDE.md §2.2 puts the full directory under the
 * teacher and gives a TA a per-course roster instead.
 *
 * Redesign V2, the artifact's STUDENTS: search + "Add student", status tabs,
 * an active grid, and waiting registrations as rows with a group pick, Decline
 * and Accept. The artifact's Performance / Attendance columns are not drawn:
 * the directory route returns neither, so the grid shows the enrolled-course
 * count and join date the API really gives.
 */
export default function StudentDirectoryPage() {
  // The sidebar search sends /manage/students?search=...
  const initialSearch = useSearchParams().get('search') ?? '';
  const [search, setSearch] = useState(initialSearch);
  const [view, setView] = useState<View>(initialSearch ? 'all' : 'active');
  const [declining, setDeclining] = useState<StudentDirectoryEntry | null>(null);
  const [creating, setCreating] = useState(false);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, flash] = useToast();
  const { token } = useSession();

  const { data, error, loading, reload } = useApi(
    (t) => api.admin.students(t, search.trim() || undefined, view === 'all' ? undefined : view),
    [search, view],
  );
  const { data: groups } = useApi((t) => api.admin.groups(t), []);

  async function accept(student: StudentDirectoryEntry) {
    const groupId = picks[student.id] ?? groups?.[0]?.id ?? '';
    if (!token || !groupId) return;
    setBusyId(student.id);
    setActionError(null);
    try {
      await api.admin.acceptRegistration(token, student.id, groupId);
      flash(`${student.name} accepted`);
      reload();
    } catch (cause) {
      setActionError(cause instanceof ApiError ? cause.message : 'Could not accept this registration.');
    } finally {
      setBusyId(null);
    }
  }

  const filtered = Boolean(search.trim());

  return (
    <>
      <PageTitle title="Students" />
      <section aria-labelledby="st-h" className="cl-panel">
        <PanelHead id="st-h" title="Students">
          <input
            className="cl-inp w-[240px]"
            type="search"
            aria-label="Search students"
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" className="cl-btnp" onClick={() => setCreating(true)}>
            <ClIcon name="plus" small />
            Add student
          </button>
        </PanelHead>

        <ClTabs tabs={TABS} value={view} onChange={(v) => setView(v as View)} label="Student status" />

        {actionError && (
          <p role="alert" className="cl-soft mt-3" style={{ color: 'var(--cl-bad)' }}>
            {actionError}
          </p>
        )}

        {loading && !data && !error && <ClSkeleton rows={5} label="Loading students" />}
        {error && (
          <ClError
            message={error.isAuth ? "You don't have access to this page." : error.message}
            onRetry={error.isAuth ? undefined : reload}
          />
        )}
        {data && data.length === 0 && (
          <ClEmpty
            icon="people"
            tone="cl-tone-blue"
            title={filtered ? 'No matches' : view === 'waiting' ? 'No registrations waiting' : 'No students yet'}
            hint={filtered ? 'No student account matches that search.' : 'Students who register will be listed here.'}
          />
        )}

        {data && data.length > 0 && view === 'waiting' && (
          <>
            <p className="cl-muted mx-1 mb-2 mt-3 text-[13.5px]">
              Registered students can&apos;t see any course content until you accept them into a group.
            </p>
            {data.map((s) => (
              <div key={s.id} className="cl-grow flex-wrap" style={{ cursor: 'default' }}>
                <Avatar student={s} />
                <span className="cl-grow-main min-w-[200px]">
                  <Link href={`/manage/students/${s.id}`} className="block truncate text-fg no-underline">
                    {s.name}
                  </Link>
                  <span className="cl-sub block truncate">
                    {s.email} · Registered {formatDate(s.createdAt)}
                  </span>
                </span>
                <label className="cl-muted inline-flex items-center gap-2 text-[13px]">
                  Group
                  <select
                    className="cl-inp"
                    style={{ height: 34 }}
                    value={picks[s.id] ?? groups?.[0]?.id ?? ''}
                    onChange={(e) => setPicks((p) => ({ ...p, [s.id]: e.target.value }))}
                  >
                    {(groups ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Link href={`/manage/students/${s.id}`} className="cl-glink">
                  Edit
                </Link>
                <button type="button" className="cl-btns" disabled={busyId === s.id} onClick={() => setDeclining(s)}>
                  Decline
                </button>
                <button
                  type="button"
                  className="cl-btnp"
                  disabled={busyId === s.id || !(picks[s.id] ?? groups?.[0]?.id)}
                  onClick={() => void accept(s)}
                >
                  Accept
                </button>
              </div>
            ))}
          </>
        )}

        {data && data.length > 0 && view !== 'waiting' && (
          <div className="mt-2 overflow-x-auto">
            <div className="cl-gt" role="table" aria-label="Students">
              <div className="hd" role="row" style={{ gridTemplateColumns: COLS }}>
                <span>Name</span>
                <span>Status</span>
                <span className="r">Courses</span>
                <span className="r">Joined</span>
                <span />
              </div>
              {data.map((s) => (
                <div key={s.id} className="rw" role="row" style={{ gridTemplateColumns: COLS }}>
                  <Link
                    href={`/manage/students/${s.id}`}
                    className="inline-flex items-center gap-3 py-1.5 text-fg no-underline hover:no-underline"
                  >
                    <Avatar student={s} />
                    <span className="min-w-0">
                      <span className="block truncate">{s.name}</span>
                      <span className="cl-muted block truncate text-[12.5px]">{s.email}</span>
                    </span>
                  </Link>
                  <span
                    className="text-[13.5px]"
                    style={{ color: s.status === 'rejected' ? 'var(--cl-bad)' : s.status === 'waiting' ? 'var(--cl-warn)' : 'var(--cl-ok)' }}
                  >
                    {STATUS_LABEL[s.status]}
                  </span>
                  <span className="r">{s.enrolledCourseCount}</span>
                  <span className="r cl-muted">{formatDate(s.createdAt)}</span>
                  <span className="r inline-flex justify-end gap-3.5">
                    {s.status === 'waiting' && (
                      <button type="button" className="cl-glink" onClick={() => setView('waiting')}>
                        Decide
                      </button>
                    )}
                    <Link href={`/manage/students/${s.id}`} className="cl-glink">
                      Edit
                    </Link>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            flash('Student created — sign-in link sent');
            reload();
          }}
        />
      )}
      {declining && (
        <DeclineModal
          student={declining}
          onClose={() => setDeclining(null)}
          onDone={() => {
            flash(`${declining.name} declined`);
            setDeclining(null);
            reload();
          }}
        />
      )}
      {toast}
    </>
  );
}

function Avatar({ student }: { student: StudentDirectoryEntry }) {
  // The directory route does not return avatarUrl yet (backend gap); shown once it does.
  const url = (student as StudentDirectoryEntry & { avatarUrl?: string | null }).avatarUrl;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={mediaSrc(url)} alt="" width={32} height={32} className="size-8 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="cl-av">{initialsOf(student.name)}</span>
  );
}

/** Reject one waiting registration, with the optional reason the API takes. */
function DeclineModal({
  student,
  onClose,
  onDone,
}: {
  student: StudentDirectoryEntry;
  onClose: () => void;
  onDone: () => void;
}) {
  const { token } = useSession();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reject() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.admin.rejectRegistration(token, student.id, reason.trim() || undefined);
      onDone();
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : 'Could not reject this registration.');
      setBusy(false);
    }
  }

  return (
    <ClModal
      open
      title={`Decline ${student.name}?`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="cl-btnp" disabled={busy} onClick={() => void reject()}>
            {busy ? 'Declining…' : 'Decline registration'}
          </button>
        </>
      }
    >
      <div className="cl-fgrid">
        {error && (
          <p role="alert" className="cl-soft m-0" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}
        <p className="cl-muted m-0 text-[13.5px]">{student.email}</p>
        <label className="cl-fl">
          Rejection reason (optional)
          <textarea className="cl-inp" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      </div>
    </ClModal>
  );
}

/**
 * Creates a student directly, already active - no password, a sign-in link
 * is emailed instead (`PEOPLE-3`). The artifact's student modal also asks for
 * group and parent contact; the create route takes only a name and an email,
 * so those are set afterwards (group on accept/placement, parent on the profile).
 */
function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { token } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !name.trim() || !email.trim()) return;
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
    <ClModal
      open
      title="Add student"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="cl-btns" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="create-student" className="cl-btnp" disabled={busy || !name.trim() || !email.trim()}>
            {busy ? 'Creating…' : 'Add student'}
          </button>
        </>
      }
    >
      <form id="create-student" onSubmit={submit} className="cl-fgrid">
        {error && (
          <p role="alert" className="cl-soft m-0" style={{ color: 'var(--cl-bad)' }}>
            {error}
          </p>
        )}
        <p className="cl-muted m-0 text-[13.5px]">
          Creates an active account immediately and emails a sign-in link - no approval queue.
        </p>
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
      </form>
    </ClModal>
  );
}
