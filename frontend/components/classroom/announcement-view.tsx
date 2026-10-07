import { mediaSrc } from '@/lib/api';
import { ClIcon } from '@/components/shell/classroom';

/** The fields a rendered announcement needs - an `Announcement` or an unsaved draft. */
export interface AnnouncementViewData {
  title: string;
  body: string;
  mediaKind: 'image' | 'video' | 'youtube' | 'file' | null;
  mediaUrl: string | null;
  mediaReadUrl: string | null;
}

/** Only a youtube-nocookie embed is ever framed; anything else is a link. */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    let id: string | null = null;
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') id = parsed.searchParams.get('v');
    else if (host === 'youtu.be') id = parsed.pathname.slice(1) || null;
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}` : null;
  } catch {
    return null;
  }
}

/** The attached file's display name: the stored name is a server UUID, so say what it is instead. */
export function mediaLabel(kind: AnnouncementViewData['mediaKind']): string {
  return kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : kind === 'youtube' ? 'YouTube video' : 'Document';
}

function Media({ data }: { data: AnnouncementViewData }) {
  const stored = data.mediaUrl?.trim();
  if (!data.mediaKind || !stored) return null;
  const src = mediaSrc((data.mediaReadUrl ?? '').trim() || stored);

  if (data.mediaKind === 'image') {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={data.title} className="mt-3 max-h-[360px] w-full rounded-[14px] object-cover" />
    );
  }
  if (data.mediaKind === 'video') {
    return <video controls src={src} className="mt-3 max-h-[360px] w-full rounded-[14px]" />;
  }
  if (data.mediaKind === 'youtube') {
    const embed = youtubeEmbedUrl(stored);
    return embed ? (
      <div className="mt-3 aspect-video w-full overflow-hidden rounded-[14px]">
        <iframe src={embed} title="YouTube video" className="h-full w-full border-0" allowFullScreen />
      </div>
    ) : (
      <a href={stored} target="_blank" rel="noopener noreferrer" className="cl-chip-row mt-3 no-underline">
        <ClIcon name="play" small />
        <span className="min-w-0 flex-1 truncate">Watch on YouTube</span>
        <span className="cl-glink">Open</span>
      </a>
    );
  }
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" download className="cl-chip-row mt-3 no-underline">
      <ClIcon name="file" small />
      <span className="min-w-0 flex-1 truncate">Document</span>
      <span className="cl-glink">Open</span>
    </a>
  );
}

/**
 * One announcement exactly as a student reads it - shared by the student's
 * Announcements tab and the teacher's Preview page so the two cannot drift.
 */
export function AnnouncementView({
  data,
  author,
  avatar,
  meta,
}: {
  data: AnnouncementViewData;
  author: string;
  avatar?: string;
  meta?: React.ReactNode;
}) {
  const paragraphs = data.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <article className="cl-grow items-start" style={{ cursor: 'default' }}>
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span className="cl-ic40 cl-tone-sky">
          <ClIcon name="announce" small />
        </span>
      )}
      <div className="cl-grow-main">
        <div className="text-[14px]">
          <span className="font-medium">{author}</span>
          {meta && <span className="cl-muted"> · {meta}</span>}
        </div>
        <h3 className="m-0 mt-1 text-[16px] font-normal">{data.title.trim() || 'Untitled announcement'}</h3>
        <div className="mt-1 flex flex-col gap-2 text-[14px] text-fg-2">
          {paragraphs.length > 0 ? (
            paragraphs.map((p, i) => (
              <p key={i} className="m-0 whitespace-pre-line">
                {p}
              </p>
            ))
          ) : (
            <p className="cl-muted m-0">The announcement text will appear here.</p>
          )}
        </div>
        <Media data={data} />
      </div>
    </article>
  );
}

/** sessionStorage key the composer and posted rows use to hand a preview over. */
export const PREVIEW_KEY = 'te.announcementPreview';

export interface PreviewPayload extends AnnouncementViewData {
  id?: string;
  audienceLabel?: string;
  date?: string;
}

export function stashPreview(payload: PreviewPayload): void {
  try {
    window.sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(payload));
  } catch {
    // Storage blocked: the preview page says there is nothing to show.
  }
}
