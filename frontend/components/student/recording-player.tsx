'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDuration } from '@/lib/format';
import type { RecordingWithProgress } from '@/lib/types';
import { Button, Tag, Loader, Icon } from '@/components/ui';

/**
 * What a recording's `videoUrl` actually is has never been decided (CLAUDE.md
 * §3, §8) - Bunny Stream's signed-URL delivery is unbuilt, so today the field
 * is whatever URL the teacher pasted at upload. This is the one place that
 * branches on its shape, so a future Bunny integration is one case added
 * here rather than a rewrite of the page.
 */
export type VideoKind = 'file' | 'youtube' | 'vimeo' | 'bunny' | 'link';

export function classifyVideoUrl(url: string): { kind: VideoKind; embedUrl?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'link' };
  }
  const host = parsed.hostname.replace(/^www\./, '');
  const path = parsed.pathname.toLowerCase();

  if (/\.(mp4|webm|ogg|ogv|mov)$/.test(path)) {
    return { kind: 'file' };
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = parsed.searchParams.get('v');
    if (v) return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${v}` };
  }
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    if (id) return { kind: 'youtube', embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }
  if (host === 'vimeo.com') {
    const id = parsed.pathname.split('/').filter(Boolean)[0];
    if (id && /^\d+$/.test(id)) {
      return { kind: 'vimeo', embedUrl: `https://player.vimeo.com/video/${id}` };
    }
  }
  // Bunny Stream's iframe embed host. Not wired up anywhere yet - §3/§8 leave
  // signed playback URLs unbuilt - but recognizing the shape means the day
  // uploads switch to it, this branch is already correct.
  if (host === 'iframe.mediadelivery.net' || host.endsWith('.b-cdn.net')) {
    return { kind: 'bunny', embedUrl: url };
  }

  return { kind: 'link' };
}

/** How often a playing `<video>` reports its position back to the server. */
const PROGRESS_INTERVAL_MS = 15_000;

export function RecordingPlayer({
  recording,
  initialWatchedSeconds,
  onProgress,
}: {
  recording: RecordingWithProgress;
  /** Where to resume a native `<video>` from. Ignored by the embed branches. */
  initialWatchedSeconds: number;
  /**
   * Reports the furthest position reached, in seconds. The server clamps and
   * only ever moves this forward (`upsertProgress`), so sending a lower value
   * on a rewind is harmless.
   */
  onProgress: (watchedSeconds: number) => void;
}) {
  const { kind, embedUrl } = classifyVideoUrl(recording.videoUrl);

  if (kind === 'file') {
    return (
      <FilePlayer
        key={recording.id}
        recording={recording}
        initialWatchedSeconds={initialWatchedSeconds}
        onProgress={onProgress}
      />
    );
  }

  if (kind === 'youtube' || kind === 'vimeo' || kind === 'bunny') {
    return (
      <EmbedPlayer key={recording.id} recording={recording} embedUrl={embedUrl!} onProgress={onProgress} />
    );
  }

  return <LinkOutPlayer key={recording.id} recording={recording} onProgress={onProgress} />;
}

/* --- A real file: native controls, automatic progress -------------------- */

function FilePlayer({
  recording,
  initialWatchedSeconds,
  onProgress,
}: {
  recording: RecordingWithProgress;
  initialWatchedSeconds: number;
  onProgress: (watchedSeconds: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // The furthest position actually reached this mount, and the last value
  // sent to the server - kept apart so a throttled interval can tell whether
  // there is anything new to report before it fires a request.
  const maxReachedRef = useRef(initialWatchedSeconds);
  const lastSentRef = useRef(initialWatchedSeconds);
  const resumedRef = useRef(false);

  useEffect(() => {
    maxReachedRef.current = initialWatchedSeconds;
    lastSentRef.current = initialWatchedSeconds;
    resumedRef.current = false;
  }, [recording.id, initialWatchedSeconds]);

  const flush = () => {
    if (maxReachedRef.current > lastSentRef.current) {
      lastSentRef.current = maxReachedRef.current;
      onProgress(Math.floor(maxReachedRef.current));
    }
  };

  useEffect(() => {
    const interval = setInterval(flush, PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording.id]);

  return (
    <div className="flex flex-col gap-3">
      <video
        ref={videoRef}
        key={recording.id}
        src={recording.videoUrl}
        controls
        className="aspect-video w-full rounded-md bg-black"
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (!video || resumedRef.current) return;
          resumedRef.current = true;
          // Never resume onto the last few seconds - that reads as "finished
          // and restarted" rather than "picking up where you left off".
          if (initialWatchedSeconds < video.duration - 5) {
            video.currentTime = initialWatchedSeconds;
          }
        }}
        onTimeUpdate={() => {
          const video = videoRef.current;
          if (!video) return;
          if (video.currentTime > maxReachedRef.current) {
            maxReachedRef.current = video.currentTime;
          }
        }}
        onPause={flush}
        onEnded={() => {
          maxReachedRef.current = recording.durationSeconds;
          flush();
        }}
      />
      {initialWatchedSeconds > 0 && !recording.completed && (
        <p className="text-xs text-fg-3">Resumed from {formatDuration(initialWatchedSeconds)}.</p>
      )}
    </div>
  );
}

/* --- A recognized provider: embed it, but be honest about what we cannot
   see. Cross-origin iframes give no playback events, so there is no way to
   drive progress automatically - the fallback is a manual control, not a
   fake meter. ------------------------------------------------------------- */

function EmbedPlayer({
  recording,
  embedUrl,
  onProgress,
}: {
  recording: RecordingWithProgress;
  embedUrl: string;
  onProgress: (watchedSeconds: number) => void;
}) {
  const [marking, setMarking] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <iframe
        key={recording.id}
        src={embedUrl}
        title={recording.title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="aspect-video w-full rounded-md border-0 bg-black"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-light bg-surface-3 px-4 py-3">
        <p className="text-xs text-fg-3">
          {recording.completed
            ? 'Marked as watched.'
            : "This player runs outside the platform, so we cannot see how far you've watched. Mark it once you're done."}
        </p>
        {!recording.completed && (
          <Button
            size="small"
            variant="secondary"
            disabled={marking}
            onClick={async () => {
              setMarking(true);
              try {
                onProgress(recording.durationSeconds);
              } finally {
                setMarking(false);
              }
            }}
          >
            {marking ? <Loader size={3} label="Marking as watched" /> : <Icon name="CircleCheck" size={14} />}
            Mark as watched
          </Button>
        )}
      </div>
    </div>
  );
}

/* --- Anything else: a clear link out, never a broken player -------------- */

function LinkOutPlayer({
  recording,
  onProgress,
}: {
  recording: RecordingWithProgress;
  onProgress: (watchedSeconds: number) => void;
}) {
  const [marking, setMarking] = useState(false);

  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-md border border-border-medium bg-surface-3 px-6 text-center">
      <p className="text-md font-medium text-fg">{recording.title}</p>
      <p className="max-w-[42ch] text-xs text-fg-3">
        This recording opens in its own tab rather than playing here, so watch progress cannot be
        tracked automatically.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="primary"
          icon="ArrowUpRight"
          onClick={() => window.open(recording.videoUrl, '_blank', 'noopener,noreferrer')}
        >
          Open recording
        </Button>
        {!recording.completed && (
          <Button
            variant="secondary"
            disabled={marking}
            onClick={async () => {
              setMarking(true);
              try {
                onProgress(recording.durationSeconds);
              } finally {
                setMarking(false);
              }
            }}
          >
            {marking ? <Loader size={3} label="Marking as watched" /> : <Icon name="CircleCheck" size={14} />}
            Mark as watched
          </Button>
        )}
        {recording.completed && <Tag tone="green">Watched</Tag>}
      </div>
    </div>
  );
}
