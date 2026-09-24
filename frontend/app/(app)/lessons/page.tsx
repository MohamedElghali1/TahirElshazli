'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatDuration } from '@/lib/format';
import type { RecordingWithProgress } from '@/lib/types';
import { Panel, EmptyState, Loader, Tag, Meter, Button, IconButton, Select, Icon, cx } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';
import { RecordingPlayer } from '@/components/student/recording-player';

/**
 * My lessons (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "Recording library,
 * thumbnails by default, grid/list toggle, watched bar"). Course-scoped via
 * the rail's switcher; the curriculum picker alongside the player toggles
 * between a thumbnail grid (the default) and the original dense row list.
 */
type ProgressOverride = Pick<RecordingWithProgress, 'watchedSeconds' | 'completed' | 'completedAt'>;

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'lessons.viewMode';

export default function LessonsPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="My lessons" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <RecordingsList courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function RecordingsList({ courseId }: { courseId: string }) {
  const { token } = useSession();
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ProgressOverride>>({});
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'grid';
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_KEY);
      return stored === 'list' || stored === 'grid' ? stored : 'grid';
    } catch {
      // A private window with storage disabled just keeps the default.
      return 'grid';
    }
  });

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // Nothing remembered; every visit falls back to the default.
    }
  };

  const { data, error, loading, reload } = useApi(
    (token) =>
      api.recordings.list(token, courseId, {
        chapter: chapter || undefined,
        topic: topic || undefined,
      }),
    [courseId, chapter, topic],
  );

  const recordings = useMemo(
    () => (data?.recordings ?? []).map((r) => ({ ...r, ...overrides[r.id] })),
    [data, overrides],
  );

  const chapters = data?.filters.chapters ?? [];
  const topics = data?.filters.topics ?? [];

  const resumeRecording = useMemo(
    () => recordings.find((r) => !r.completed) ?? recordings[0] ?? null,
    [recordings],
  );

  const effectiveSelectedId =
    selectedId && recordings.some((r) => r.id === selectedId)
      ? selectedId
      : (resumeRecording?.id ?? null);

  const selectedIndex = recordings.findIndex((r) => r.id === effectiveSelectedId);
  const selected = selectedIndex >= 0 ? recordings[selectedIndex] : null;
  const prev = selectedIndex > 0 ? recordings[selectedIndex - 1] : null;
  const next =
    selectedIndex >= 0 && selectedIndex < recordings.length - 1
      ? recordings[selectedIndex + 1]
      : null;

  const handleProgress = (recordingId: string, watchedSeconds: number) => {
    if (!token) return;
    api.recordings
      .saveProgress(token, recordingId, watchedSeconds)
      .then((progress) => {
        setOverrides((prevOverrides) => ({
          ...prevOverrides,
          [recordingId]: {
            watchedSeconds: progress.watchedSeconds,
            completed: progress.completed,
            completedAt: progress.completedAt,
          },
        }));
      })
      .catch(() => {
        // A dropped progress ping is not worth interrupting playback for.
      });
  };

  const done = recordings.filter((r) => r.completed).length;
  const completionPercentage =
    recordings.length === 0 ? 0 : Math.round((done / recordings.length) * 100);

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2">
            <span className="text-xs text-fg-3">Chapter</span>
            <Select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              aria-label="Filter by chapter"
              className="w-auto min-w-[160px]"
              options={[{ value: '', label: 'All chapters' }, ...chapters.map((c) => ({ value: c, label: c }))]}
            />
          </label>

          <label className="flex items-center gap-2">
            <span className="text-xs text-fg-3">Topic</span>
            <Select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              aria-label="Filter by topic"
              className="w-auto min-w-[160px]"
              options={[{ value: '', label: 'All topics' }, ...topics.map((t) => ({ value: t, label: t }))]}
            />
          </label>
        </div>

        {recordings.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-fg-3">
            <span className="num">
              {done} / {recordings.length} watched
            </span>
            <Meter value={completionPercentage} width={80} name="Recordings watched" />
          </div>
        )}

        <Button size="small" variant="secondary" icon="List" className="md:hidden" onClick={() => setSidebarOpen(true)}>
          Curriculum
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center p-12">
          <Loader label="Loading recordings" />
        </div>
      )}
      {error && (
        <EmptyState
          icon="AlertTriangle"
          title={error.message}
          action={<Button onClick={reload}>Try again</Button>}
        />
      )}

      {data && recordings.length === 0 && (
        <Panel bodyClassName="">
          <EmptyState
            icon="Video"
            title="Nothing to watch here"
            description={
              chapter || topic
                ? 'No recordings match that filter. Clear it to see everything.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        </Panel>
      )}

      {data && recordings.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Panel bodyClassName="p-4">
            {selected ? (
              <div className="flex flex-col gap-4">
                <RecordingPlayer
                  recording={selected}
                  initialWatchedSeconds={selected.watchedSeconds}
                  onProgress={(seconds) => handleProgress(selected.id, seconds)}
                />

                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium text-fg">{selected.title}</h2>
                      <Tag>{selected.chapter}</Tag>
                      {selected.completed && <Tag tone="green">Watched</Tag>}
                      <Link
                        href={`/lessons/${selected.id}`}
                        className="inline-flex items-center gap-1 text-xs text-fg-3 underline underline-offset-2 hover:text-fg"
                      >
                        Open lesson page
                        <Icon name="ArrowUpRight" size={12} />
                      </Link>
                    </div>
                    <p className="num mt-1 text-xs text-fg-3">
                      {formatDate(selected.lessonDate)} · {formatDuration(selected.durationSeconds)}
                    </p>
                    {selected.topics.length > 0 && (
                      <p className="mt-2 text-xs text-fg-3">{selected.topics.join(', ')}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="small"
                      variant="secondary"
                      icon="ChevronLeft"
                      disabled={!prev}
                      onClick={() => prev && setSelectedId(prev.id)}
                    >
                      Previous
                    </Button>
                    <Button
                      size="small"
                      variant="secondary"
                      iconRight="ChevronRight"
                      disabled={!next}
                      onClick={() => next && setSelectedId(next.id)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon="PlayerPlay" title="Pick a recording" description="Choose a lesson from the list to start watching." />
            )}
          </Panel>

          <CurriculumSidebar
            recordings={recordings}
            selectedId={selected?.id ?? null}
            onSelect={(recordingId) => {
              setSelectedId(recordingId);
              setSidebarOpen(false);
            }}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
            viewMode={viewMode}
            onChangeViewMode={changeViewMode}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The course curriculum, in lesson order. Sits alongside the player on a
 * desktop viewport (`md:` and up per the system's one breakpoint); below it,
 * a full-screen overlay opened by the "Curriculum" button.
 */
function CurriculumSidebar({
  recordings,
  selectedId,
  onSelect,
  open,
  onClose,
  viewMode,
  onChangeViewMode,
}: {
  recordings: RecordingWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onClose: () => void;
  viewMode: ViewMode;
  onChangeViewMode: (mode: ViewMode) => void;
}) {
  const viewToggle = (
    <div className="flex items-center gap-1">
      <IconButton
        icon="Apps"
        label="Grid view"
        active={viewMode === 'grid'}
        onClick={() => onChangeViewMode('grid')}
      />
      <IconButton
        icon="LayoutList"
        label="List view"
        active={viewMode === 'list'}
        onClick={() => onChangeViewMode('list')}
      />
    </div>
  );

  const list =
    viewMode === 'grid' ? (
      <CurriculumGrid recordings={recordings} selectedId={selectedId} onSelect={onSelect} />
    ) : (
      <CurriculumList recordings={recordings} selectedId={selectedId} onSelect={onSelect} />
    );

  return (
    <>
      <Panel
        title="Curriculum"
        action={viewToggle}
        className="hidden md:block"
        bodyClassName={cx('max-h-[70vh] overflow-y-auto', viewMode === 'grid' && 'p-3')}
      >
        {list}
      </Panel>

      {open && (
        <CurriculumDrawer onClose={onClose}>
          {viewMode === 'grid' ? (
            <div className="p-3">
              <CurriculumGrid recordings={recordings} selectedId={selectedId} onSelect={onSelect} />
            </div>
          ) : (
            <CurriculumList recordings={recordings} selectedId={selectedId} onSelect={onSelect} />
          )}
        </CurriculumDrawer>
      )}
    </>
  );
}

/**
 * The grid variant of the curriculum picker — thumbnail cards, one column at
 * the sidebar's width. `thumbnailUrl` is null for every recording that exists
 * today (`023_recording_thumbnails.sql`), so the icon fallback is the normal
 * path, not an edge case.
 */
function CurriculumGrid({
  recordings,
  selectedId,
  onSelect,
}: {
  recordings: RecordingWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="flex flex-col gap-2" role="list">
      {recordings.map((recording) => {
        const watchedPercentage =
          recording.durationSeconds > 0
            ? (recording.watchedSeconds / recording.durationSeconds) * 100
            : 0;
        return (
          <li key={recording.id}>
            <button
              type="button"
              onClick={() => onSelect(recording.id)}
              aria-current={recording.id === selectedId ? 'true' : undefined}
              className={cx(
                'flex w-full flex-col gap-2 rounded-md p-2 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover',
                recording.id === selectedId && 'bg-wash-hover',
              )}
            >
              <span className="relative block aspect-video w-full overflow-hidden rounded-sm bg-surface-3">
                {recording.thumbnailUrl ? (
                  // A teacher-supplied external URL, not an optimizable local asset.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={recording.thumbnailUrl}
                    alt=""
                    width={320}
                    height={180}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center">
                    <Icon name="Video" size={24} className="text-fg-4" />
                  </span>
                )}
                {recording.completed && (
                  <span className="absolute end-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--border-light)]">
                    <Icon name="CircleCheck" size={14} className="text-status-green-text" />
                  </span>
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={cx(
                    'block truncate text-xs',
                    recording.id === selectedId ? 'font-medium text-fg' : 'text-fg-2',
                  )}
                >
                  {recording.title}
                </span>
                <span className="num mt-[2px] block text-xxs text-fg-4">
                  {formatDuration(recording.durationSeconds)}
                </span>
                {recording.watchedSeconds > 0 && !recording.completed && (
                  <span className="mt-1 block">
                    <Meter value={watchedPercentage} name={`${recording.title} watched`} label={false} />
                  </span>
                )}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The mobile curriculum drawer, as a real modal dialog — focus trap, Escape
 * to close, focus returned to whatever opened it. The only modal in the
 * product so far; the moment a second one lands this belongs in
 * `components/ui/` instead of being copied.
 */
function CurriculumDrawer({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="curriculum-drawer-title"
      className="fixed inset-0 z-50 flex flex-col bg-surface md:hidden"
    >
      <div className="flex h-8 items-center justify-between border-b border-border-light px-4">
        <span id="curriculum-drawer-title" className="text-base font-semibold text-fg">
          Curriculum
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close curriculum"
          className="flex h-6 w-6 items-center justify-center rounded-sm text-fg-2 hover:bg-wash-hover"
        >
          <Icon name="X" size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}

function CurriculumList({
  recordings,
  selectedId,
  onSelect,
}: {
  recordings: RecordingWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const chapters = useMemo(() => {
    const order: string[] = [];
    const byChapter = new Map<string, RecordingWithProgress[]>();
    for (const r of recordings) {
      if (!byChapter.has(r.chapter)) {
        byChapter.set(r.chapter, []);
        order.push(r.chapter);
      }
      byChapter.get(r.chapter)!.push(r);
    }
    return order.map((chapter) => ({ chapter, items: byChapter.get(chapter)! }));
  }, [recordings]);

  return (
    <ul className="divide-y divide-border-light" role="list">
      {chapters.map(({ chapter, items }) => (
        <ChapterGroup key={chapter} chapter={chapter} items={items} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </ul>
  );
}

function ChapterGroup({
  chapter,
  items,
  selectedId,
  onSelect,
}: {
  chapter: string;
  items: RecordingWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left hover:bg-wash-hover"
      >
        <span className="truncate text-xs font-medium uppercase tracking-[0.04em] text-fg-3">
          {chapter}
        </span>
        <Icon
          name="ChevronDown"
          size={12}
          className={cx('shrink-0 text-fg-4 transition-transform duration-[var(--dur-fast)]', !open && '-rotate-90')}
        />
      </button>
      {open && (
        <ul role="list">
          {items.map((recording) => (
            <li key={recording.id}>
              <button
                type="button"
                onClick={() => onSelect(recording.id)}
                aria-current={recording.id === selectedId ? 'true' : undefined}
                className={cx(
                  'flex w-full items-center gap-3 py-2 pe-4 ps-6 text-left transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover',
                  recording.id === selectedId && 'bg-wash-hover',
                )}
              >
                <span aria-hidden className="shrink-0 text-fg-3">
                  {recording.completed ? (
                    <Icon name="CircleCheck" size={16} className="text-status-green-text" />
                  ) : recording.id === selectedId ? (
                    <Icon name="PlayerPlay" size={14} className="text-accent" />
                  ) : (
                    <span className="block h-4 w-4 rounded-full shadow-[inset_0_0_0_1.5px_var(--border-medium)]" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cx(
                      'block truncate text-xs',
                      recording.id === selectedId ? 'font-medium text-fg' : 'text-fg-2',
                    )}
                  >
                    {recording.title}
                  </span>
                  {recording.watchedSeconds > 0 && !recording.completed && (
                    <span className="mt-[2px] block max-w-[160px]">
                      <Meter
                        value={(recording.watchedSeconds / recording.durationSeconds) * 100}
                        name={`${recording.title} watched`}
                        label={false}
                      />
                    </span>
                  )}
                </span>
                <span className="num shrink-0 text-xxs text-fg-4">
                  {formatDuration(recording.durationSeconds)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
