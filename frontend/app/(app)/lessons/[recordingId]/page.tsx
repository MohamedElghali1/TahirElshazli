'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  ASSESSMENT_STATUS_CHIP,
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
  formatDuration,
  isQuizWork,
} from '@/lib/format';
import type { AssessmentListItem, RecordingWithProgress } from '@/lib/types';
import {
  Panel,
  EmptyState,
  Loader,
  Tag,
  Button,
  ButtonLink,
  Breadcrumb,
  PageHeader,
  Icon,
  cx,
  type TagTone,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { CourseGate } from '@/components/student/course-gate';
import { useSelectedCourse } from '@/components/shell/course-context';
import { RecordingPlayer } from '@/components/student/recording-player';

/**
 * Lesson detail (`docs/PRODUCT_SPEC.md` §6: `[NEW]`, "Player, chapters, the
 * work set from it, its material, and a 'Next recording' card").
 *
 * Course-scoped via the rail's switcher like `/lessons` itself — but unlike it,
 * this page is reached by a LINK, and a link carries no course selection. So a
 * recording missing from the selected course is not a refusal until the
 * student's own other courses have been checked; see `FindInOtherCourses`.
 *
 * "Its material" is NOT built here: `materials` has no relation to a lesson or
 * a recording (`courseId` and `category` only), so there is nothing to filter
 * by without inventing a join (`CLAUDE.md` §13). Closing it needs a
 * `materials.lesson_id` column, both repository drivers, and a staff control to
 * set it. Recorded as the open half of `STU-3`, which stays `[~]`.
 */

// `ASSESSMENT_STATUS_CHIP` still speaks the legacy tone name `'neutral'` — the
// new `Tag` scale calls it `'gray'`. Same map `/homework` uses.
const TONE: Record<string, TagTone> = {
  neutral: 'gray',
  blue: 'blue',
  amber: 'amber',
  green: 'green',
  red: 'red',
  violet: 'violet',
};

type ProgressOverride = Pick<RecordingWithProgress, 'watchedSeconds' | 'completed' | 'completedAt'>;

export default function LessonDetailPage({
  params,
}: {
  params: Promise<{ recordingId: string }>;
}) {
  const { recordingId } = use(params);
  const { courses, selectedId, selectCourse, loading } = useSelectedCourse();

  // Memoised because it is a `useEffect` dependency downstream: rebuilding the
  // array every render would re-run the lookup effect forever.
  const otherCourseIds = useMemo(
    () => (courses ?? []).map((course) => course.id).filter((id) => id !== selectedId),
    [courses, selectedId],
  );

  return (
    <>
      <PageTitle title="My lessons" backHref="/lessons" />
      <CourseGate loading={loading} hasCourses={Boolean(courses && courses.length > 0)}>
        {selectedId && (
          <LessonDetail
            courseId={selectedId}
            recordingId={recordingId}
            otherCourseIds={otherCourseIds}
            onFoundElsewhere={selectCourse}
          />
        )}
      </CourseGate>
    </>
  );
}

function LessonDetail({
  courseId,
  recordingId,
  otherCourseIds,
  onFoundElsewhere,
}: {
  courseId: string;
  recordingId: string;
  otherCourseIds: string[];
  onFoundElsewhere: (courseId: string) => void;
}) {
  const { token } = useSession();
  const [override, setOverride] = useState<ProgressOverride | null>(null);

  const { data, error, loading, reload } = useApi(
    (token) => api.recordings.list(token, courseId),
    [courseId],
  );
  const { data: assessments } = useApi(
    (token) => api.assessments.list(token, courseId),
    [courseId],
  );

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Loader label="Loading lesson" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          icon="AlertTriangle"
          title={error.isNotFound ? 'This lesson is not available to you.' : error.message}
          action={!error.isNotFound && <Button onClick={reload}>Try again</Button>}
        />
      </div>
    );
  }

  if (!data) return null;

  const recordings = data.recordings;
  const index = recordings.findIndex((r) => r.id === recordingId);

  // Not in the selected course. Before saying no, look at the student's OWN
  // other courses: this page is reached by a link, and a link does not carry
  // the rail's course selection with it. A student in two courses who follows
  // a bookmarked lesson while the switcher sits on the other one was being
  // told "not available to you" about a lesson they are fully entitled to —
  // the UI lying about the reader's own access, which is the mirror of the
  // 403-not-404 rule in CLAUDE.md §7.
  //
  // Bounded by §1: a student holds one to three courses, so this is at most
  // two extra reads and only on the miss path. It searches nothing the caller
  // is not already enrolled in, so it widens no access — the server still
  // refuses anything else.
  if (index === -1) {
    return (
      <FindInOtherCourses
        recordingId={recordingId}
        courseIds={otherCourseIds}
        onFound={onFoundElsewhere}
      />
    );
  }

  const recording = override ? { ...recordings[index], ...override } : recordings[index];
  const next = index < recordings.length - 1 ? recordings[index + 1] : null;

  // The work set from this lesson: assessments sharing its lessonId, minus
  // Google Form work (that is a quiz and lives on `/quizzes` — same exclusion
  // `/homework` applies, for the same reason).
  const work = (assessments ?? []).filter(
    (item) => item.lessonId === recording.lessonId && !isQuizWork(item.workType),
  );

  const handleProgress = (watchedSeconds: number) => {
    if (!token) return;
    api.recordings
      .saveProgress(token, recording.id, watchedSeconds)
      .then((progress) =>
        setOverride({
          watchedSeconds: progress.watchedSeconds,
          completed: progress.completed,
          completedAt: progress.completedAt,
        }),
      )
      .catch(() => {
        // A dropped progress ping is not worth interrupting playback for.
      });
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        breadcrumb={
          <Breadcrumb items={[{ href: '/lessons', label: 'My lessons' }, { label: recording.title }]} />
        }
        title={recording.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Tag>{recording.chapter}</Tag>
            {recording.completed && <Tag tone="green">Watched</Tag>}
            <span className="num text-xs text-fg-3">
              {formatDate(recording.lessonDate)} · {formatDuration(recording.durationSeconds)}
            </span>
          </span>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-6">
          <Panel bodyClassName="p-4">
            <RecordingPlayer
              recording={recording}
              initialWatchedSeconds={recording.watchedSeconds}
              onProgress={handleProgress}
            />
            {recording.topics.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {recording.topics.map((topic) => (
                  <Tag key={topic}>{topic}</Tag>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Work set from this lesson" bodyClassName={work.length > 0 ? '' : 'p-4'}>
            {work.length === 0 ? (
              <EmptyState
                icon="Clipboard"
                title="Nothing set from this lesson"
                description="Homework and assignments set from this recording appear here. Quizzes live on their own page."
              />
            ) : (
              <ul className="divide-y divide-border-light">
                {work.map((item) => (
                  <li key={item.id}>
                    <WorkRow item={item} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <NextRecordingCard next={next} />
        </div>
      </div>
    </div>
  );
}

/**
 * The miss path: is this recording on one of the student's *other* courses?
 *
 * If it is, switch the rail to that course — the page then re-renders through
 * the normal path and shows the lesson. If it is not, the recording is
 * genuinely not the caller's and the refusal stands. Either way this reads
 * only courses the student is already enrolled in; the server's own checks are
 * untouched and nothing here can widen access.
 */
function FindInOtherCourses({
  recordingId,
  courseIds,
  onFound,
}: {
  recordingId: string;
  courseIds: string[];
  onFound: (courseId: string) => void;
}) {
  const { token } = useSession();
  const [settled, setSettled] = useState(courseIds.length === 0);

  useEffect(() => {
    if (!token || courseIds.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const courseId of courseIds) {
        try {
          const list = await api.recordings.list(token, courseId);
          if (cancelled) return;
          if (list.recordings.some((r) => r.id === recordingId)) {
            onFound(courseId);
            return;
          }
        } catch {
          // A course we cannot read is simply not where this lesson is.
        }
      }
      if (!cancelled) setSettled(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [token, courseIds, recordingId, onFound]);

  if (!settled) {
    return (
      <div className="flex justify-center p-12">
        <Loader label="Finding this lesson" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <EmptyState
        icon="AlertTriangle"
        title="This lesson is not available to you."
        description="It may have been removed, or it belongs to a course you are not enrolled in."
        action={<ButtonLink href="/lessons">Back to my lessons</ButtonLink>}
      />
    </div>
  );
}

function WorkRow({ item }: { item: AssessmentListItem }) {
  const locked = item.status === 'locked';

  const row = (
    <div
      className={cx(
        'flex items-center gap-3 px-4 py-3 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)]',
        locked ? 'opacity-60' : 'hover:bg-wash-hover',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-base font-medium text-fg">{item.title}</span>
          <Tag tone={TONE[ASSESSMENT_STATUS_CHIP[item.status]] ?? 'gray'}>
            {ASSESSMENT_STATUS_LABEL[item.status]}
          </Tag>
        </div>
        <p className="mt-1 truncate text-xs text-fg-3">{ASSESSMENT_TYPE_LABEL[item.type]}</p>
      </div>

      <div className="w-[72px] shrink-0 text-end">
        {item.score === null ? (
          <span className="num text-xs text-fg-4">—</span>
        ) : (
          <span className="num text-base text-fg">
            {item.score}
            <span className="text-fg-4">/{item.maxScore}</span>
          </span>
        )}
      </div>
    </div>
  );

  // A locked task is not a link, same reasoning as `/homework`'s own row.
  return locked ? <div aria-disabled>{row}</div> : <Link href={`/homework/${item.id}`}>{row}</Link>;
}

/**
 * Next by `order` on this course. `thumbnailUrl` is null for everything today
 * (`023_recording_thumbnails.sql`), so the icon fallback is the normal path,
 * not an edge case — same as the library's own curriculum grid.
 */
function NextRecordingCard({ next }: { next: RecordingWithProgress | null }) {
  if (!next) {
    return (
      <Panel title="Next recording">
        <p className="text-base text-fg-4">This is the last recording on the course.</p>
      </Panel>
    );
  }

  return (
    <Panel title="Next recording" bodyClassName="p-3">
      <Link
        href={`/lessons/${next.id}`}
        className="flex gap-3 rounded-md p-2 transition-colors duration-[var(--dur-fast)] ease-[var(--ease)] hover:bg-wash-hover"
      >
        <span className="relative block aspect-video w-[120px] shrink-0 overflow-hidden rounded-sm bg-surface-3">
          {next.thumbnailUrl ? (
            // A teacher-supplied external URL, not an optimizable local asset.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={next.thumbnailUrl}
              alt=""
              width={120}
              height={68}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center">
              <Icon name="Video" size={20} className="text-fg-4" />
            </span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-medium text-fg">{next.title}</span>
          <span className="num mt-1 block text-xxs text-fg-4">{formatDuration(next.durationSeconds)}</span>
        </span>
      </Link>
    </Panel>
  );
}
