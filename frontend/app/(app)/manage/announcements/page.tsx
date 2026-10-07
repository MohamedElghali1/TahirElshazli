'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { Announcement, GroupSummary, StaffCourseSummary } from '@/lib/types';
import { Button, Icon, Loader, Select, TextArea, TextInput } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon, TEACHER_AVATAR } from '@/components/shell/classroom';
import { mediaLabel, stashPreview, youtubeEmbedUrl } from '@/components/classroom/announcement-view';
import { ClEmpty, ClError, ClRowMenu, ClSkeleton, PanelHead, useToast } from '@/components/classroom/ui';

/**
 * Staff announcements, Redesign V2 "ANNOUNCEMENTS": a composer panel on top
 * (always open; picking Edit on a posted row loads it into the same panel) and
 * the "Posted" list below with audience/status filters.
 *
 * Not drawn: the artifact's Schedule control. The API has no scheduled-send -
 * an announcement is a draft or it is published (admin publishes; an
 * assistant's post to a held course/group goes out directly) - and a date
 * field with nothing behind it would be a lie. Gap noted in the report.
 * The row's author shows as an avatar only when it is the signed-in teacher:
 * `postedBy` is an id, and there is no staff-name lookup an assistant may call.
 */

function getAudienceLabel(
  rawAudience: string,
  courses: StaffCourseSummary[] = [],
  groups: GroupSummary[] = [],
): string {
  if (rawAudience === 'all_students') return 'All students';
  if (rawAudience === 'all_tas') return 'All teaching assistants';
  if (rawAudience.startsWith('course:')) {
    const id = rawAudience.slice('course:'.length);
    const c = courses.find((x) => x.id === id);
    return c ? `Course: ${c.title}` : `Course ${id}`;
  }
  if (rawAudience.startsWith('group:')) {
    const id = rawAudience.slice('group:'.length);
    const g = groups.find((x) => x.id === id);
    if (g) {
      const c = courses.find((x) => x.id === g.courseId);
      return c ? `Group: ${g.name} (${c.title})` : `Group: ${g.name}`;
    }
    return `Group ${id}`;
  }
  return rawAudience;
}

export default function AnnouncementsPage() {
  const { user, token } = useSession();
  const admin = isAdminRole(user?.role);
  const [toast, flash] = useToast();
  const router = useRouter();

  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  // Bumped after a post so the composer remounts empty.
  const [composerKey, setComposerKey] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<{ tone: 'green' | 'amber'; message: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [audienceFilter, setAudienceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'draft' | 'published'>('');

  const { data: courses } = useApi((t) => api.staff.courses(t), []);

  const { data: groups } = useApi(async (t) => {
    if (admin) {
      return api.admin.groups(t);
    }
    if (!courses || courses.length === 0) return [];
    const allGroups = await Promise.all(
      courses.map((c) => api.staff.courseGroups(t, c.id).catch(() => []))
    );
    return allGroups.flat();
  }, [admin, courses]);

  const {
    data: announcements,
    error,
    loading,
    reload,
  } = useApi(
    async (t) => {
      if (admin && !audienceFilter) {
        return api.admin.announcements(t, { status: statusFilter || undefined });
      }

      if (audienceFilter.startsWith('group:')) {
        const groupId = audienceFilter.slice('group:'.length);
        return api.staff.groupAnnouncements(t, groupId, { status: statusFilter || undefined });
      }

      if (audienceFilter.startsWith('course:')) {
        const courseId = audienceFilter.slice('course:'.length);
        return api.staff.courseAnnouncements(t, courseId, { status: statusFilter || undefined });
      }

      if (!admin && courses && courses.length > 0) {
        const results = await Promise.all(
          courses.map((c) =>
            api.staff.courseAnnouncements(t, c.id, { status: statusFilter || undefined }).catch(() => [])
          )
        );
        return results.flat().sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }

      return [];
    },
    [admin, audienceFilter, statusFilter, courses],
  );

  const filterAudienceOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: '', label: 'All audiences' }];
    if (admin) {
      opts.push(
        { value: 'all_students', label: 'All students' },
        { value: 'all_tas', label: 'All teaching assistants' },
      );
    }
    for (const c of courses ?? []) {
      opts.push({ value: `course:${c.id}`, label: `Course: ${c.title}` });
    }
    for (const g of groups ?? []) {
      const c = (courses ?? []).find((x) => x.id === g.courseId);
      opts.push({
        value: `group:${g.id}`,
        label: c ? `Group: ${g.name} (${c.title})` : `Group: ${g.name}`,
      });
    }
    return opts;
  }, [admin, courses, groups]);

  const handlePublish = async (a: Announcement) => {
    if (!token) return;
    setActionBusy(true);
    setActionError(null);
    setActionStatus(null);
    try {
      const { delivery } = await api.admin.publishAnnouncement(token, a.id);
      if (delivery.failed === 0 && delivery.emailed > 0) {
        setActionStatus({ tone: 'green', message: `Published and emailed to ${delivery.emailed} students.` });
      } else if (delivery.emailed === 0 && delivery.failed > 0) {
        setActionStatus({
          tone: 'amber',
          message: 'Published. Email is not available, so students will only see it in the app.',
        });
      } else if (delivery.failed > 0) {
        setActionStatus({
          tone: 'amber',
          message: `Published. ${delivery.failed} of ${delivery.emailed + delivery.failed} emails could not be sent.`,
        });
      } else {
        setActionStatus({ tone: 'green', message: 'Published.' });
      }
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not publish announcement.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDelete = async (a: Announcement) => {
    if (!token) return;
    setActionBusy(true);
    setActionError(null);
    setActionStatus(null);
    try {
      if (admin) {
        await api.admin.deleteAnnouncement(token, a.id);
      } else if (a.courseId) {
        await api.staff.deleteCourseAnnouncement(token, a.courseId, a.id);
      } else if (a.groupId) {
        await api.staff.deleteGroupAnnouncement(token, a.groupId, a.id);
      }
      reload();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Could not delete announcement.');
    } finally {
      setActionBusy(false);
    }
  };

  const closeComposer = () => {
    setEditingAnnouncement(null);
    setComposerKey((k) => k + 1);
  };

  return (
    <>
      <PageTitle title="Announcements" />

      <section aria-labelledby="an-new" className="cl-panel">
        <PanelHead
          id="an-new"
          title={
            editingAnnouncement
              ? editingAnnouncement.publishedAt !== null
                ? 'Edit announcement'
                : 'Edit draft'
              : 'New announcement'
          }
        >
          {editingAnnouncement && (
            <button type="button" className="cl-glink" onClick={closeComposer}>
              Close
            </button>
          )}
        </PanelHead>
        <ComposeAnnouncementForm
          key={editingAnnouncement?.id ?? `new-${composerKey}`}
          initialAnnouncement={editingAnnouncement}
          courses={courses ?? []}
          groups={groups ?? []}
          admin={admin}
          onDone={(message) => {
            flash(message);
            closeComposer();
            reload();
          }}
          onCancel={closeComposer}
        />
      </section>

      <section aria-labelledby="an-list" className="cl-panel">
        <PanelHead id="an-list" title="Posted">
          <span className="cl-muted text-[13px]">
            {admin ? 'All announcements' : 'Held courses and groups'}
            {announcements && ` · ${announcements.length}`}
          </span>
        </PanelHead>

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Select
            aria-label="Audience"
            className="w-[220px]"
            value={audienceFilter}
            onChange={(e) => setAudienceFilter(e.target.value)}
            options={filterAudienceOptions}
          />
          <Select
            aria-label="Status"
            className="w-[160px]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as '' | 'draft' | 'published')}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'published', label: 'Sent' },
              { value: 'draft', label: 'Drafts' },
            ]}
          />
        </div>

        {actionError && <ClError message={actionError} />}
        {actionStatus && (
          <p
            role="status"
            className="m-0 mb-3 px-2 text-[14px]"
            style={{ color: actionStatus.tone === 'green' ? 'var(--cl-ok)' : 'var(--cl-warn)' }}
          >
            {actionStatus.message}
          </p>
        )}

        {loading && !announcements && <ClSkeleton rows={3} label="Loading announcements" />}
        {error && <ClError message={error.message} onRetry={reload} />}
        {announcements && announcements.length === 0 && (
          <ClEmpty
            icon="announce"
            title="No announcements match"
            hint="Announcements created for your scope appear here."
          />
        )}
        {announcements?.map((a) => {
          const mine = a.postedBy === user?.id;
          const draft = a.publishedAt === null;
          return (
            <div key={a.id} className="cl-grow items-start">
              <span className="cl-av shrink-0">
                {mine && user?.role === 'teacher' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={TEACHER_AVATAR} alt="" />
                ) : (
                  <ClIcon name="announce" small />
                )}
              </span>
              <span className="cl-grow-main">
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent p-0 text-start text-[15px] text-fg hover:underline"
                    onClick={() => setEditingAnnouncement(a)}
                  >
                    {a.title}
                  </button>
                  {draft && (
                    <span className="cl-ic40 cl-tone-sand !h-auto !w-auto rounded-full px-2 py-0.5 text-[12px]">
                      Draft
                    </span>
                  )}
                </span>
                <span className="cl-sub">
                  {mine ? 'You' : 'Staff'} · {getAudienceLabel(a.audience, courses ?? [], groups ?? [])} ·{' '}
                  {formatDate(a.publishedAt ?? a.createdAt)}
                  {!draft && ` · ${a.recipientCount} ${a.recipientCount === 1 ? 'recipient' : 'recipients'}`}
                </span>
                <span className="mt-1 line-clamp-2 block whitespace-pre-line text-[14px] text-fg-2">{a.body}</span>
              </span>
              <ClRowMenu
                label={`Actions for ${a.title}`}
                items={[
                  {
                    label: 'Preview',
                    onSelect: () => {
                      stashPreview({
                        ...a,
                        audienceLabel: getAudienceLabel(a.audience, courses ?? [], groups ?? []),
                        date: a.publishedAt ?? a.createdAt,
                      });
                      router.push(`/manage/announcements/preview?id=${encodeURIComponent(a.id)}`);
                    },
                  },
                  { label: 'Edit', onSelect: () => setEditingAnnouncement(a) },
                  ...(draft && admin
                    ? [{ label: 'Publish', onSelect: () => void handlePublish(a), disabled: actionBusy }]
                    : []),
                  ...(draft
                    ? [{ label: 'Delete', danger: true, onSelect: () => void handleDelete(a), disabled: actionBusy }]
                    : []),
                ]}
              />
            </div>
          );
        })}
      </section>
      {toast}
    </>
  );
}

function ComposeAnnouncementForm({
  initialAnnouncement,
  courses,
  groups,
  admin,
  onDone,
  onCancel,
}: {
  initialAnnouncement: Announcement | null;
  courses: StaffCourseSummary[];
  groups: GroupSummary[];
  admin: boolean;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const { token } = useSession();
  const router = useRouter();
  const isPublished = initialAnnouncement !== null && initialAnnouncement.publishedAt !== null;

  const audienceOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    if (admin) {
      opts.push(
        { value: 'all_students', label: 'All students' },
        { value: 'all_tas', label: 'All teaching assistants' },
      );
    }
    for (const c of courses) {
      opts.push({ value: `course:${c.id}`, label: `Course: ${c.title}` });
    }
    for (const g of groups) {
      const c = courses.find((x) => x.id === g.courseId);
      opts.push({
        value: `group:${g.id}`,
        label: c ? `Group: ${g.name} (${c.title})` : `Group: ${g.name}`,
      });
    }
    return opts;
  }, [admin, courses, groups]);

  const [audience, setAudience] = useState(
    initialAnnouncement?.audience || (audienceOptions[0]?.value ?? '')
  );
  const [title, setTitle] = useState(initialAnnouncement?.title ?? '');
  const [body, setBody] = useState(initialAnnouncement?.body ?? '');
  const [mediaKind, setMediaKind] = useState<'image' | 'video' | 'youtube' | 'file' | ''>(
    initialAnnouncement?.mediaKind ?? ''
  );
  const [mediaUrl, setMediaUrl] = useState(initialAnnouncement?.mediaUrl ?? '');
  // The stored form's preview - `readUrl` where it can differ (platform-stored
  // media behind a private R2 bucket, `REM-030`), the same value otherwise
  // (an external link is already fetchable). Never sent to the API: only
  // `mediaUrl` is submitted.
  const [mediaReadUrl, setMediaReadUrl] = useState(
    initialAnnouncement?.mediaReadUrl ?? initialAnnouncement?.mediaUrl ?? '',
  );

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Which "Add ..." button opened the file picker - decides the accept filter and the stored kind.
  const [pickKind, setPickKind] = useState<'image' | 'video' | 'file'>('image');

  const pickFile = (kind: 'image' | 'video' | 'file') => {
    setPickKind(kind);
    setUploadError(null);
    // The accept filter reads pickKind, so open the picker after it renders.
    setTimeout(() => fileInputRef.current?.click(), 0);
  };
  const clearMedia = () => {
    setMediaKind('');
    setMediaUrl('');
    setMediaReadUrl('');
  };

  const { data: reachData, loading: reachLoading } = useApi(
    (t) => {
      if (!audience) return Promise.resolve({ reach: 0 });
      return api.staff.announcementReach(t, audience);
    },
    [audience],
  );

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !token) return;
    setUploading(true);
    setUploadError(null);
    try {
      const res = await api.staff.upload(token, file);
      setMediaUrl(res.url);
      setMediaReadUrl(res.readUrl);
      setMediaKind(res.kind === 'image' ? 'image' : res.kind === 'video' ? 'video' : 'file');
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Could not upload file.');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleSubmit = async (publishNow: boolean) => {
    if (!token) return;
    const cleanTitle = title.trim();
    const cleanBody = body.trim();
    if (!cleanTitle || !cleanBody) {
      setFormError('Title and body are required.');
      return;
    }
    if (!isPublished && !audience) {
      setFormError('Please select an audience.');
      return;
    }

    setBusy(true);
    setFormError(null);

    try {
      const mediaPayload = {
        title: cleanTitle,
        body: cleanBody,
        mediaKind: mediaKind ? mediaKind : null,
        mediaUrl: mediaKind && mediaUrl.trim() ? mediaUrl.trim() : null,
      };

      if (initialAnnouncement) {
        if (isPublished) {
          if (admin) {
            await api.admin.updateAnnouncement(token, initialAnnouncement.id, mediaPayload);
          } else if (initialAnnouncement.courseId) {
            await api.staff.updateCourseAnnouncement(
              token,
              initialAnnouncement.courseId,
              initialAnnouncement.id,
              mediaPayload,
            );
          } else if (initialAnnouncement.groupId) {
            await api.staff.updateGroupAnnouncement(
              token,
              initialAnnouncement.groupId,
              initialAnnouncement.id,
              mediaPayload,
            );
          }
        } else {
          if (admin) {
            await api.admin.updateAnnouncement(token, initialAnnouncement.id, {
              ...mediaPayload,
              audience,
            });
            if (publishNow) {
              await api.admin.publishAnnouncement(token, initialAnnouncement.id);
            }
          } else {
            if (initialAnnouncement.courseId) {
              await api.staff.updateCourseAnnouncement(
                token,
                initialAnnouncement.courseId,
                initialAnnouncement.id,
                mediaPayload,
              );
            } else if (initialAnnouncement.groupId) {
              await api.staff.updateGroupAnnouncement(
                token,
                initialAnnouncement.groupId,
                initialAnnouncement.id,
                mediaPayload,
              );
            }
          }
        }
      } else {
        if (admin) {
          const created = await api.admin.createAnnouncement(token, {
            ...mediaPayload,
            audience,
          });
          if (publishNow) {
            await api.admin.publishAnnouncement(token, created.id);
          }
        } else {
          if (audience.startsWith('course:')) {
            const courseId = audience.slice('course:'.length);
            await api.staff.postCourseAnnouncement(token, courseId, mediaPayload);
          } else if (audience.startsWith('group:')) {
            const groupId = audience.slice('group:'.length);
            await api.staff.postGroupAnnouncement(token, groupId, mediaPayload);
          } else {
            throw new Error('Assistants may only post to assigned courses or groups.');
          }
        }
      }

      onDone(publishNow ? 'Published.' : initialAnnouncement ? 'Changes saved.' : admin ? 'Draft saved.' : 'Posted.');
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save announcement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(false);
        }}
        className="flex max-w-[640px] flex-col gap-4"
      >
        {isPublished ? (
          <div className="flex flex-col gap-1">
            <span className="font-medium text-fg">Audience</span>
            <span className="text-fg-2">
              {getAudienceLabel(initialAnnouncement.audience, courses, groups)}
            </span>
            <span className="text-fg-3">Audience cannot be changed after publishing</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Select
              label="Audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              options={audienceOptions}
              required
            />
            <div className="flex items-center gap-2 text-fg-3">
              <Icon name="Users" size={16} />
              {reachLoading ? (
                <span>Estimating reach…</span>
              ) : reachData !== null && reachData !== undefined ? (
                <span>
                  Reaches <span className="font-medium text-fg">{reachData.reach}</span>{' '}
                  {reachData.reach === 1 ? 'recipient' : 'recipients'}
                </span>
              ) : (
                <span>Reaches —</span>
              )}
            </div>
          </div>
        )}

        <TextInput
          label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          placeholder="e.g. Midterm revision timetable"
          maxLength={200}
        />

        <TextArea
          label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          placeholder="Write the announcement message here…"
          rows={6}
          maxLength={2000}
        />

        <div className="flex flex-col gap-2">
          <span className="cl-flab m-0">Attachment</span>
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept={pickKind === 'image' ? 'image/*' : pickKind === 'video' ? 'video/*' : '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv'}
          />
          {mediaKind && mediaKind !== 'youtube' && mediaUrl.trim() ? (
            <div className="cl-chip-row">
              <span className="min-w-0 flex-1 truncate">
                {mediaLabel(mediaKind)}
              </span>
              <button type="button" className="cl-glink cl-glink--danger" onClick={clearMedia}>
                Remove
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="cl-btns" disabled={uploading} onClick={() => pickFile('image')}>
                Add photo
              </button>
              <button type="button" className="cl-btns" disabled={uploading} onClick={() => pickFile('file')}>
                Add document
              </button>
              <button type="button" className="cl-btns cl-btns--quiet" disabled={uploading} onClick={() => pickFile('video')}>
                Add video
              </button>
              <button
                type="button"
                className="cl-btns cl-btns--quiet"
                disabled={uploading}
                onClick={() => (mediaKind === 'youtube' ? clearMedia() : setMediaKind('youtube'))}
              >
                Add YouTube link
              </button>
              {uploading && <Loader label="Uploading" />}
            </div>
          )}
          {mediaKind === 'youtube' && (
            <TextInput
              label="YouTube video URL"
              value={mediaUrl}
              onChange={(e) => {
                // A pasted URL is always external - already fetchable.
                setMediaUrl(e.target.value);
                setMediaReadUrl(e.target.value);
              }}
              placeholder="https://www.youtube.com/watch?v=..."
              hint="Paste a public YouTube video URL"
            />
          )}
          {mediaKind === 'youtube' && mediaUrl.trim() && !youtubeEmbedUrl(mediaUrl.trim()) && (
            <p className="cl-muted m-0 text-[13px]">Students will see this as a link rather than an embedded player.</p>
          )}
          {uploadError && <ClError message={uploadError} />}
        </div>

        {formError && <ClError message={formError} />}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="tertiary"
            onClick={() => {
              stashPreview({
                title,
                body,
                mediaKind: mediaKind || null,
                mediaUrl: mediaUrl.trim() || null,
                mediaReadUrl: mediaReadUrl.trim() || null,
                audienceLabel: getAudienceLabel(
                  isPublished ? initialAnnouncement.audience : audience,
                  courses,
                  groups,
                ),
              });
              router.push('/manage/announcements/preview');
            }}
          >
            Preview
          </Button>
          <Button type="button" variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => handleSubmit(false)}
          >
            {isPublished ? 'Save changes' : admin ? 'Save draft' : 'Post'}
          </Button>

          {admin && !isPublished && (
            <Button
              type="button"
              variant="primary"
              disabled={busy}
              onClick={() => handleSubmit(true)}
            >
              {busy ? <Loader label="Publishing" /> : 'Publish now'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
