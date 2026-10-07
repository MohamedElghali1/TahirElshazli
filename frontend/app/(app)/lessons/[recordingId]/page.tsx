'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import {
  ASSESSMENT_STATUS_LABEL,
  ASSESSMENT_TYPE_LABEL,
  formatDate,
  formatDuration,
  formatFileSize,
  isQuizWork,
} from '@/lib/format';
import type { AssessmentListItem, Material, RecordingWithProgress } from '@/lib/types';
import { BackLink, ClEmpty, ClError, ClSkeleton, PanelHead } from '@/components/classroom/ui';
import { ClIcon } from '@/components/shell/classroom';
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
 * Materials carry `lesson_id` (migration `025`); there is still no staff
 * control to set it, materials have no authoring surface.
 */

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
      <PageTitle title="Recordings" backHref="/lessons" />
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
  const { data: course } = useApi((token) => api.courses.get(token, courseId), [courseId]);
  const { data: materials } = useApi(
    (token) => api.materials.list(token, courseId),
    [courseId],
  );

  if (loading) {
    return (
      <section className="cl-panel" aria-busy>
        <ClSkeleton rows={3} label="Loading lesson" />
      </section>
    );
  }

  if (error) {
    return (
      <>
        <BackLink href="/lessons">All lessons</BackLink>
        <section className="cl-panel">
          {error.isNotFound ? (
            <ClEmpty icon="close" title="This lesson is not available to you." />
          ) : (
            <ClError message={error.message} onRetry={reload} />
          )}
        </section>
      </>
    );
  }

  if (!data) return null;

  const recordings = data.recordings;
  const index = recordings.findIndex((r) => r.id === recordingId);

  // Not in the selected course. Before saying no, look at the student's OWN
  // other courses: this page is reached by a link, and a link does not carry
  // the rail's course selection with it (the mirror of CLAUDE.md §7's
  // 403-not-404 rule). Bounded by §1: at most two extra reads, only on the
  // miss path, and only courses the caller is already enrolled in.
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
  // Google Form work (a quiz, which lives on `/quizzes`).
  const work = (assessments ?? []).filter(
    (item) => item.lessonId === recording.lessonId && !isQuizWork(item.workType),
  );

  // This lesson's material (`025`, `STU-3`): the endpoint groups by category,
  // so flatten and filter by `lessonId`. Most materials are course-wide (null).
  const lessonMaterials = Object.values(materials ?? {})
    .flat()
    .filter((m) => m.lessonId === recording.lessonId);

  const lessonTitle =
    (course?.modules ?? []).flatMap((m) => m.lessons).find((l) => l.id === recording.lessonId)?.title ?? '';

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
    <>
      <BackLink href="/lessons">All lessons</BackLink>

      <section className="cl-panel" aria-label="Now playing" style={{ padding: 16 }}>
        <div className="overflow-hidden rounded-2xl bg-black">
          <RecordingPlayer
            recording={recording}
            initialWatchedSeconds={recording.watchedSeconds}
            onProgress={handleProgress}
          />
        </div>
        <div className="px-2 pb-1 pt-4">
          <h1 className="cl-pt cl-pt--sm">{recording.title}</h1>
          <p className="cl-muted num mt-1 text-[13.5px]">
            {[lessonTitle, formatDate(recording.lessonDate), formatDuration(recording.durationSeconds)]
              .filter(Boolean)
              .join(' · ')}
            {recording.completed && <span style={{ color: 'var(--cl-ok)' }}> · Watched</span>}
          </p>
        </div>
      </section>

      <section className="cl-panel" aria-labelledby="work-h">
        <PanelHead title="Work set from this lesson" id="work-h" />
        {work.length === 0 ? (
          <ClEmpty
            icon="pen"
            title="Nothing set from this lesson"
            hint="Homework and assignments set from this recording appear here. Quizzes live on their own page."
          />
        ) : (
          <div>
            {work.map((item) => (
              <WorkRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>

      <section className="cl-panel" aria-labelledby="mat-h">
        <PanelHead title="Material from this lesson" id="mat-h">
          <Link href="/materials" className="cl-glink">
            All materials
          </Link>
        </PanelHead>
        {lessonMaterials.length === 0 ? (
          <p className="cl-muted text-[14px]">
            Nothing is attached to this lesson. The course&rsquo;s own materials are on the materials page.
          </p>
        ) : (
          <div>
            {lessonMaterials.map((material) => (
              <MaterialRow key={material.id} material={material} />
            ))}
          </div>
        )}
      </section>

      <NextRecordingCard next={next} />
    </>
  );
}

/**
 * One material attached to this lesson. Same affordances as `/materials`:
 * an anchor straight to the file, type and size on the end, `rel="noreferrer"`.
 */
function MaterialRow({ material }: { material: Material }) {
  return (
    <a href={material.fileUrl} target="_blank" rel="noreferrer" className="cl-grow">
      <span className="cl-ic40 cl-tone-sand">
        <ClIcon name="doc" small />
      </span>
      <span className="cl-grow-main">
        {material.title}
        <span className="cl-sub num">
          {material.fileType.toUpperCase()} · {formatFileSize(material.fileSizeBytes)}
        </span>
      </span>
      <ClIcon name="download" small />
    </a>
  );
}

/**
 * The miss path: is this recording on one of the student's *other* courses?
 * If so, switch the rail to that course. Reads only courses the student is
 * already enrolled in; the server's own checks are untouched.
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
      <section className="cl-panel" aria-busy>
        <ClSkeleton rows={2} label="Finding this lesson" />
      </section>
    );
  }

  return (
    <>
      <BackLink href="/lessons">All lessons</BackLink>
      <section className="cl-panel">
        <ClEmpty
          icon="close"
          title="This lesson is not available to you."
          hint="It may have been removed, or it belongs to a course you are not enrolled in."
          action={
            <Link href="/lessons" className="cl-btnp">
              Back to my lessons
            </Link>
          }
        />
      </section>
    </>
  );
}

function WorkRow({ item }: { item: AssessmentListItem }) {
  const locked = item.status === 'locked';

  const body = (
    <>
      <span className="cl-ic40 cl-tone-peach">
        <ClIcon name="pen" small />
      </span>
      <span className="cl-grow-main">
        {item.title}
        <span className="cl-sub">
          {ASSESSMENT_TYPE_LABEL[item.type]} · {ASSESSMENT_STATUS_LABEL[item.status]}
        </span>
      </span>
      <span className="num min-w-[72px] text-end">
        {item.score === null ? (
          <span className="cl-muted">—</span>
        ) : (
          <>
            {item.score}
            <span className="cl-muted">/{item.maxScore}</span>
          </>
        )}
      </span>
    </>
  );

  // A locked task is not a link, same reasoning as `/homework`'s own row.
  return locked ? (
    <div className="cl-grow opacity-60" aria-disabled>
      {body}
    </div>
  ) : (
    <Link href={`/homework/${item.id}`} className="cl-grow">
      {body}
    </Link>
  );
}

/**
 * Next by `order` on this course. `thumbnailUrl` is null for everything today,
 * so the icon fallback is the normal path.
 */
function NextRecordingCard({ next }: { next: RecordingWithProgress | null }) {
  return (
    <section className="cl-panel" aria-labelledby="next-h">
      <PanelHead title="Next recording" id="next-h" />
      {!next ? (
        <p className="cl-muted text-[14px]">This is the last recording on the course.</p>
      ) : (
        <Link href={`/lessons/${next.id}`} className="cl-grow">
          {next.thumbnailUrl ? (
            // A teacher-supplied external URL, not an optimizable local asset.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={next.thumbnailUrl}
              alt=""
              width={120}
              height={68}
              loading="lazy"
              className="aspect-video w-[120px] shrink-0 rounded-xl object-cover"
            />
          ) : (
            <span className="cl-ic40 cl-tone-blue">
              <ClIcon name="play" small />
            </span>
          )}
          <span className="cl-grow-main">
            {next.title}
            <span className="cl-sub num">{formatDuration(next.durationSeconds)}</span>
          </span>
        </Link>
      )}
    </section>
  );
}
