'use client';

import { use, useState } from 'react';
import { CheckCircleIcon, PlayIcon } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { useApi } from '@/lib/session';
import { formatDate, formatDuration } from '@/lib/format';
import type { RecordingWithProgress } from '@/lib/types';
import {
  Chip,
  EmptyState,
  ErrorState,
  Meter,
  Panel,
  RowsSkeleton,
  Select,
} from '@/components/ui';
import { PageBody } from '@/components/app/page-parts';

export default function RecordingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [chapter, setChapter] = useState('');
  const [topic, setTopic] = useState('');

  const { data, error, loading, reload } = useApi(
    (token) =>
      api.recordings.list(token, id, {
        chapter: chapter || undefined,
        topic: topic || undefined,
      }),
    [id, chapter, topic],
  );

  // The filter options come back with the list, so they stay correct even
  // while a filter is applied.
  const chapters = data?.filters.chapters ?? [];
  const topics = data?.filters.topics ?? [];

  return (
    <PageBody className="flex flex-col gap-[var(--sp-6)]">
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

      <Panel
        title="Recorded lessons"
        action={
          data && (
            <span className="num text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
              {data.recordings.length}
            </span>
          )
        }
        bodyClassName=""
      >
        {loading && <RowsSkeleton rows={6} />}
        {error && <ErrorState message={error.message} onRetry={reload} />}
        {data && data.recordings.length === 0 && (
          <EmptyState
            title="Nothing to watch here"
            body={
              chapter || topic
                ? 'No recordings match that filter. Clear it to see everything.'
                : 'Recordings are posted after each class and stay available for the course.'
            }
          />
        )}
        {data && data.recordings.length > 0 && (
          <ul className="rows">
            {data.recordings.map((recording) => (
              <li key={recording.id}>
                <RecordingRow recording={recording} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </PageBody>
  );
}

function RecordingRow({ recording }: { recording: RecordingWithProgress }) {
  const watched =
    recording.durationSeconds > 0
      ? Math.min(100, (recording.watchedSeconds / recording.durationSeconds) * 100)
      : 0;

  return (
    <a
      href={recording.videoUrl}
      target="_blank"
      rel="noreferrer"
      className="row flex items-center gap-[var(--sp-4)] px-[var(--sp-4)] py-[var(--sp-3)] transition-colors duration-[var(--dur-fast)]"
    >
      <span
        aria-hidden
        className="flex h-[var(--h-lg)] w-[var(--h-lg)] shrink-0 items-center justify-center rounded-[var(--r-xs)] bg-[var(--bg-tertiary)] text-[var(--fg-secondary)]"
      >
        {recording.completed ? (
          <CheckCircleIcon size={16} weight="fill" className="text-[var(--chip-green-fg)]" />
        ) : (
          <PlayIcon size={14} weight="fill" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[var(--sp-2)]">
          <span className="truncate text-[var(--fs-base)] font-medium text-[var(--fg-primary)]">
            {recording.title}
          </span>
          <Chip tone="neutral">{recording.chapter}</Chip>
        </div>
        <p className="num mt-[var(--sp-1)] text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          {formatDate(recording.lessonDate)} · {formatDuration(recording.durationSeconds)}
        </p>
        {watched > 0 && !recording.completed && (
          <div className="mt-[var(--sp-2)] max-w-[220px]">
            <Meter value={watched} label={`Watched ${Math.round(watched)}%`} />
          </div>
        )}
      </div>

      <span className="hidden shrink-0 text-[var(--fs-xs)] text-[var(--fg-tertiary)] sm:block">
        {recording.topics.slice(0, 2).join(', ')}
      </span>
    </a>
  );
}
