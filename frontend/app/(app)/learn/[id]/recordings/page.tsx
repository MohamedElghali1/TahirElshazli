'use client';

import { use, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CircleIcon,
  ListIcon,
  PlayIcon,
  XIcon,
} from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatDuration } from '@/lib/format';
import type { RecordingWithProgress } from '@/lib/types';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  Meter,
  Panel,
  RowsSkeleton,
  Select,
  cx,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';
import { RecordingPlayer } from '@/components/app/recording-player';

/**
 * A local override for the fields the progress endpoint can change, keyed by
 * recording id. Progress pings would otherwise have to reload the whole list
 * to reflect a completion, which restarts the video the student is mid-way
 * through. Merging on top of the fetched list keeps the player mounted.
 */
type ProgressOverride = Pick<
  RecordingWithProgress,
  'watchedSeconds' | 'completed' | 'completedAt'
>;

export default function RecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { token } = useSession();
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ProgressOverride>>({});

  const { data, error, loading, reload } = useApi(
    (token) =>
      api.recordings.list(token, id, {
        chapter: chapter || undefined,
        topic: topic || undefined,
      }),
    [id, chapter, topic],
  );

  // Server order (already sorted by lesson position) with any local progress
  // patched on top, so a save reflects immediately without a refetch.
  const recordings = useMemo(
    () =>
      (data?.recordings ?? []).map((r) => ({ ...r, ...overrides[r.id] })),
    [data, overrides],
  );

  const chapters = data?.filters.chapters ?? [];
  const topics = data?.filters.topics ?? [];

  // Entry point: the first recording the student has not finished, so
  // "continue watching" means something rather than always opening lesson 1.
  const resumeRecording = useMemo(
    () => recordings.find((r) => !r.completed) ?? recordings[0] ?? null,
    [recordings],
  );

  // Derived rather than synced through an effect: the entry point is the
  // student's explicit choice if they made one and it still exists in the
  // (possibly filtered) list, otherwise the resume point, otherwise nothing.
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
        // A dropped progress ping is not worth interrupting playback for -
        // the next throttled tick, or the next visit, tries again.
      });
  };

  const done = recordings.filter((r) => r.completed).length;
  const completionPercentage =
    recordings.length === 0 ? 0 : Math.round((done / recordings.length) * 100);

  return (
    <PageBody className="flex flex-col gap-[var(--sp-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--sp-3)]">
        <div className="flex flex-wrap gap-[var(--sp-3)]">
          <label className="flex items-center gap-[var(--sp-2)]">
            <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              Chapter
            </span>
            <Select
              value={chapter}
              onChange={(e) => setChapter(e.target.value)}
              className="w-auto min-w-[160px]"
              aria-label="Filter by chapter"
            >
              <option value="">All chapters</option>
              {chapters.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>

          <label className="flex items-center gap-[var(--sp-2)]">
            <span className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              Topic
            </span>
            <Select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="w-auto min-w-[160px]"
              aria-label="Filter by topic"
            >
              <option value="">All topics</option>
              {topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {/* Completion only (§5.1) - a count of recordings finished, never a
            grade. Hidden until there is at least one recording to count. */}
        {recordings.length > 0 && (
          <div className="flex items-center gap-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
            <span className="num">
              {done} / {recordings.length} watched
            </span>
            <div className="w-[80px]">
              <Meter value={completionPercentage} label="Recordings watched" />
            </div>
          </div>
        )}

        <Button
          size="sm"
          variant="secondary"
          className="lg:hidden"
          onClick={() => setSidebarOpen(true)}
        >
          <ListIcon size={14} />
          Curriculum
        </Button>
      </div>

      {loading && <RowsSkeleton rows={6} />}
      {error && <ErrorState message={error.message} onRetry={reload} />}

      {data && recordings.length === 0 && (
        <Panel bodyClassName="">
          <EmptyState
            title="Nothing to watch here"
            body={
              chapter || topic
                ? 'No recordings match that filter. Clear it to see everything.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        </Panel>
      )}

      {data && recordings.length > 0 && (
        <div className="grid gap-[var(--sp-4)] lg:grid-cols-[1fr_320px]">
          <Panel bodyClassName="p-[var(--sp-4)]">
            {selected ? (
              <div className="flex flex-col gap-[var(--sp-4)]">
                <RecordingPlayer
                  recording={selected}
                  initialWatchedSeconds={selected.watchedSeconds}
                  onProgress={(seconds) => handleProgress(selected.id, seconds)}
                />

                <div className="flex flex-wrap items-start justify-between gap-[var(--sp-4)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-[var(--sp-2)]">
                      <h2 className="text-[var(--fs-lg)] font-medium text-[var(--fg-primary)]">
                        {selected.title}
                      </h2>
                      <Chip tone="neutral">{selected.chapter}</Chip>
                      {selected.completed && (
                        <Chip tone="green">Watched</Chip>
                      )}
                    </div>
                    <p className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                      {formatDate(selected.lessonDate)} ·{' '}
                      {formatDuration(selected.durationSeconds)}
                    </p>
                    {selected.topics.length > 0 && (
                      <p className="mt-[var(--sp-2)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
                        {selected.topics.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-[var(--sp-2)]">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!prev}
                      onClick={() => prev && setSelectedId(prev.id)}
                    >
                      <ArrowLeftIcon size={14} />
                      Previous
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!next}
                      onClick={() => next && setSelectedId(next.id)}
                    >
                      Next
                      <ArrowRightIcon size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState
                title="Pick a recording"
                body="Choose a lesson from the list to start watching."
              />
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
          />
        </div>
      )}
    </PageBody>
  );
}

/**
 * The course curriculum, in lesson order. Sits alongside the player on a
 * desktop viewport (`lg:` and up); below 768px it becomes a full-screen
 * overlay opened by the "Curriculum" button, since there is no room to show
 * both a video and a list at once.
 */
function CurriculumSidebar({
  recordings,
  selectedId,
  onSelect,
  open,
  onClose,
}: {
  recordings: RecordingWithProgress[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <Panel
        title="Curriculum"
        className="hidden lg:block"
        bodyClassName="max-h-[70vh] overflow-y-auto"
      >
        <CurriculumList
          recordings={recordings}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      </Panel>

      {/* Mobile drawer. Fixed and full-screen rather than a slide-in panel -
          `<768px` has no room for a partial overlay to read cleanly. */}
      {open && (
        <CurriculumDrawer onClose={onClose}>
          <CurriculumList
            recordings={recordings}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </CurriculumDrawer>
      )}
    </>
  );
}

/**
 * The mobile curriculum drawer, as a real modal dialog.
 *
 * It covers the page rather than sitting beside it, so the assistive-technology
 * contract has to match what the eye sees: a keyboard user must not be able to
 * tab into the content the overlay is hiding, Escape must close it, and focus
 * has to come back to whatever opened it. Rendering a bare `<div>` over the
 * page looks identical and satisfies none of that.
 *
 * The trap is hand-rolled rather than pulled from a dependency because it is
 * the only modal in the product so far. The moment a second one lands, this
 * should become a shared primitive in `components/ui.tsx` instead of being
 * copied.
 */
function CurriculumDrawer({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Whatever had focus when the drawer opened gets it back on close, so
    // dismissing does not dump the user at the top of the document.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      // Focus trap. Queried on each keypress rather than cached, because the
      // list below is collapsible and its focusable set changes as the user
      // opens and closes chapter groups.
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
      className="fixed inset-0 z-50 flex flex-col bg-[var(--bg-primary)] lg:hidden"
    >
      <div className="flex h-[var(--h-md)] items-center justify-between border-b border-[var(--border-light)] px-[var(--sp-4)]">
        <span
          id="curriculum-drawer-title"
          className="text-[var(--fs-base)] font-semibold text-[var(--fg-primary)]"
        >
          Curriculum
        </span>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close curriculum"
          className="flex h-[var(--h-sm)] w-[var(--h-sm)] items-center justify-center rounded-[var(--r-sm)] text-[var(--fg-secondary)] hover:bg-[var(--bg-wash)]"
        >
          <XIcon size={16} />
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
  // Grouped by chapter, in the order chapters first appear - a course-player
  // curriculum reads as a syllabus, not a flat list.
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
    <ul className="rows" role="list">
      {chapters.map(({ chapter, items }) => (
        <ChapterGroup
          key={chapter}
          chapter={chapter}
          items={items}
          selectedId={selectedId}
          onSelect={onSelect}
        />
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
  // Every chapter opens expanded by default - a course this small never
  // benefits from starting collapsed, and the toggle exists for later.
  const [open, setOpen] = useState<boolean>(true);

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="row flex w-full items-center justify-between gap-[var(--sp-2)] px-[var(--sp-4)] py-[var(--sp-2)] text-left"
      >
        <span className="truncate text-[var(--fs-xs)] font-medium uppercase tracking-[0.04em] text-[var(--fg-tertiary)]">
          {chapter}
        </span>
        <CaretDownIcon
          size={12}
          className={cx(
            'shrink-0 text-[var(--fg-muted)] transition-transform duration-[var(--dur-fast)]',
            !open && '-rotate-90',
          )}
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
                  'row flex w-full items-center gap-[var(--sp-3)] px-[var(--sp-4)] py-[var(--sp-2)] pl-[var(--sp-6)] text-left transition-colors duration-[var(--dur-fast)]',
                  recording.id === selectedId && 'bg-[var(--bg-wash)]',
                )}
              >
                <span aria-hidden className="shrink-0 text-[var(--fg-tertiary)]">
                  {recording.completed ? (
                    <CheckCircleIcon
                      size={16}
                      weight="fill"
                      className="text-[var(--chip-green-fg)]"
                    />
                  ) : recording.id === selectedId ? (
                    <PlayIcon size={14} weight="fill" className="text-[var(--accent)]" />
                  ) : (
                    <CircleIcon size={16} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cx(
                      'block truncate text-[var(--fs-xs)]',
                      recording.id === selectedId
                        ? 'font-medium text-[var(--fg-primary)]'
                        : 'text-[var(--fg-secondary)]',
                    )}
                  >
                    {recording.title}
                  </span>
                  {recording.watchedSeconds > 0 && !recording.completed && (
                    <span className="mt-[2px] block max-w-[160px]">
                      <Meter
                        value={(recording.watchedSeconds / recording.durationSeconds) * 100}
                        label={`${recording.title} watched`}
                      />
                    </span>
                  )}
                </span>
                <span className="num shrink-0 text-[var(--fs-xxs)] text-[var(--fg-muted)]">
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
