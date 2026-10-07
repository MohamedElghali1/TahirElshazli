'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { formatDate, formatDuration } from '@/lib/format';
import type { RecordingWithProgress } from '@/lib/types';
import { Icon } from '@/components/ui';
import { ClBar, ClChips, ClEmpty, ClError, ClSegmented, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { ClIcon } from '@/components/shell/classroom';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';
import { RecordingPlayer } from '@/components/student/recording-player';

/**
 * My lessons (`docs/PRODUCT_SPEC.md` §6: `[CHANGED]`, "Recording library,
 * thumbnails by default, grid/list toggle, watched bar"). Course-scoped via
 * the rail's switcher. Redesign V2: a "Now playing" panel over a "Recordings"
 * panel with a lesson filter; the list/grid toggle stays.
 */
type ProgressOverride = Pick<RecordingWithProgress, 'watchedSeconds' | 'completed' | 'completedAt'>;

type ViewMode = 'grid' | 'list';
const VIEW_MODE_KEY = 'lessons.viewMode';

export default function LessonsPage() {
  const { courses, selectedId, loading } = useSelectedCourse();

  return (
    <>
      <PageTitle title="Recordings" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && <RecordingsList courseId={selectedId} />}
      </CourseGate>
    </>
  );
}

function RecordingsList({ courseId }: { courseId: string }) {
  const { token } = useSession();
  const [lessonFilter, setLessonFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ProgressOverride>>({});
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === 'undefined') return 'list';
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_KEY);
      return stored === 'list' || stored === 'grid' ? stored : 'list';
    } catch {
      // A private window with storage disabled just keeps the default.
      return 'list';
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
    (token) => api.recordings.list(token, courseId),
    [courseId],
  );
  // Lesson titles come from the course outline; the recordings list has no lesson filter.
  const { data: course } = useApi((token) => api.courses.get(token, courseId), [courseId]);

  const lessonTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of course?.modules ?? []) for (const l of m.lessons) map.set(l.id, l.title);
    return map;
  }, [course]);
  const lessonOf = (r: RecordingWithProgress) => lessonTitles.get(r.lessonId) ?? '';

  const allRecordings = useMemo(
    () => (data?.recordings ?? []).map((r) => ({ ...r, ...overrides[r.id] })),
    [data, overrides],
  );
  const recordings = useMemo(
    () => (lessonFilter ? allRecordings.filter((r) => r.lessonId === lessonFilter) : allRecordings),
    [allRecordings, lessonFilter],
  );

  const lessonOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: { value: string; label: string }[] = [];
    for (const r of allRecordings) {
      const label = lessonTitles.get(r.lessonId);
      if (label && !seen.has(r.lessonId)) {
        seen.add(r.lessonId);
        out.push({ value: r.lessonId, label });
      }
    }
    return out;
  }, [allRecordings, lessonTitles]);

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

  if (loading && !data) {
    return (
      <section className="cl-panel" aria-busy>
        <PanelHead title="Recordings" />
        <ClSkeleton rows={4} label="Loading recordings" />
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

  const filtered = Boolean(lessonFilter);

  return (
    <>
      {selected && (
        <section className="cl-panel" aria-label="Now playing" style={{ padding: 16 }}>
          <div className="overflow-hidden rounded-2xl bg-black">
            <RecordingPlayer
              recording={selected}
              initialWatchedSeconds={selected.watchedSeconds}
              onProgress={(seconds) => handleProgress(selected.id, seconds)}
            />
          </div>
          <div className="flex flex-wrap items-start justify-between gap-4 px-2 pb-1 pt-4">
            <div className="min-w-0">
              <h2 className="cl-pt cl-pt--sm">{selected.title}</h2>
              <p className="cl-muted num mt-1 text-[13.5px]">
                {[lessonOf(selected), formatDate(selected.lessonDate), formatDuration(selected.durationSeconds)]
                  .filter(Boolean)
                  .join(' · ')}
                {selected.completed && <span style={{ color: 'var(--cl-ok)' }}> · Watched</span>}
              </p>
              <Link href={`/lessons/${selected.id}`} className="cl-glink mt-2 inline-flex items-center gap-1">
                Open lesson page
                <Icon name="ArrowUpRight" size={12} />
              </Link>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className="cl-btns" disabled={!prev} onClick={() => prev && setSelectedId(prev.id)}>
                Previous
              </button>
              <button type="button" className="cl-btns" disabled={!next} onClick={() => next && setSelectedId(next.id)}>
                Next
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="cl-panel" aria-labelledby="rc-h">
        <PanelHead title="Recordings" id="rc-h">
          {recordings.length > 0 && (
            <span className="flex items-center gap-2">
              <span className="cl-muted num text-[13px]">
                {done} of {recordings.length} watched
              </span>
              <ClBar value={completionPercentage} label="Recordings watched" className="w-20" />
            </span>
          )}
          <ClSegmented
            label="Recordings layout"
            value={viewMode}
            onChange={changeViewMode}
            options={[
              { value: 'list', label: 'List' },
              { value: 'grid', label: 'Grid' },
            ]}
          />
        </PanelHead>

        {lessonOptions.length > 0 && (
          <div className="mb-3">
            <ClChips
              label="Filter by lesson"
              value={lessonFilter}
              onChange={setLessonFilter}
              options={[{ value: '', label: 'All lessons' }, ...lessonOptions]}
            />
          </div>
        )}

        {data && recordings.length === 0 && (
          <ClEmpty
            icon="play"
            title="Nothing to watch here"
            hint={
              filtered
                ? 'No recordings match that filter. Clear it to see everything.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        )}

        {viewMode === 'list' ? (
          <div>
            {recordings.map((r) => (
              <RecordingRow key={r.id} recording={r} lesson={lessonOf(r)} selected={r.id === selected?.id} onSelect={setSelectedId} />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recordings.map((r) => (
              <RecordingTile key={r.id} recording={r} lesson={lessonOf(r)} selected={r.id === selected?.id} onSelect={setSelectedId} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function watchedPercent(r: RecordingWithProgress) {
  return r.durationSeconds > 0 ? (r.watchedSeconds / r.durationSeconds) * 100 : 0;
}

function RecordingRow({
  recording,
  lesson,
  selected,
  onSelect,
}: {
  recording: RecordingWithProgress;
  lesson: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const partial = recording.watchedSeconds > 0 && !recording.completed;
  return (
    <button
      type="button"
      className={selected ? 'cl-grow bg-wash-hover' : 'cl-grow'}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(recording.id)}
    >
      <span className="cl-ic40 cl-tone-blue">
        <ClIcon name="play" small />
      </span>
      <span className="cl-grow-main">
        {recording.title}
        <span className="cl-sub">
          {[lesson, formatDate(recording.lessonDate)].filter(Boolean).join(' · ')}
        </span>
        {partial && (
          <ClBar value={watchedPercent(recording)} label={`${recording.title} watched`} className="mt-2 max-w-48" />
        )}
      </span>
      <span className="cl-muted num text-sm">{formatDuration(recording.durationSeconds)}</span>
      <span className="min-w-[60px] text-end text-[13px]" style={{ color: 'var(--cl-ok)' }}>
        {recording.completed ? 'Watched' : ''}
      </span>
    </button>
  );
}

/**
 * The thumbnail variant. `thumbnailUrl` is null for every recording that exists
 * today (`024_recording_thumbnails.sql`), so the icon fallback is the normal path.
 */
function RecordingTile({
  recording,
  lesson,
  selected,
  onSelect,
}: {
  recording: RecordingWithProgress;
  lesson: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const partial = recording.watchedSeconds > 0 && !recording.completed;
  return (
    <button
      type="button"
      className={selected ? 'cl-grow flex-col items-stretch gap-2 bg-wash-hover' : 'cl-grow flex-col items-stretch gap-2'}
      aria-current={selected ? 'true' : undefined}
      onClick={() => onSelect(recording.id)}
    >
      <span className="relative block aspect-video w-full overflow-hidden rounded-xl bg-surface-3">
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
          <span className="cl-muted flex h-full w-full items-center justify-center">
            <ClIcon name="play" />
          </span>
        )}
      </span>
      <span className="block min-w-0">
        <span className="block truncate">{recording.title}</span>
        <span className="cl-sub num">
          {[lesson, formatDuration(recording.durationSeconds)].filter(Boolean).join(' · ')}
          {recording.completed && <span style={{ color: 'var(--cl-ok)' }}> · Watched</span>}
        </span>
        {partial && <ClBar value={watchedPercent(recording)} label={`${recording.title} watched`} className="mt-2" />}
      </span>
    </button>
  );
}
