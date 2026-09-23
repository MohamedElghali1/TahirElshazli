'use client';

import { useMemo, useRef, useState } from 'react';
import { api, ApiError, mediaSrc } from '@/lib/api';
import { useApi, useSession } from '@/lib/session';
import { isAdminRole } from '@/lib/roles';
import { formatDate } from '@/lib/format';
import type { Announcement, GroupSummary, StaffCourseSummary } from '@/lib/types';
import {
  Avatar,
  Button,
  EmptyState,
  Icon,
  InlineBanner,
  Loader,
  Panel,
  Select,
  Table,
  TableToolbar,
  Tag,
  TextArea,
  TextInput,
  type Column,
} from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

function getYoutubeEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const v = parsed.searchParams.get('v');
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
    }
    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1);
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
  } catch {
    return null;
  }
  return null;
}

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

  const [composing, setComposing] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
    try {
      await api.admin.publishAnnouncement(token, a.id);
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

  const columns: Column<Announcement>[] = [
    {
      label: 'Title',
      render: (a) => (
        <button
          type="button"
          onClick={() => {
            setComposing(false);
            setEditingAnnouncement(a);
          }}
          className="text-left font-medium text-fg underline-offset-4 hover:underline cursor-pointer"
        >
          {a.title}
        </button>
      ),
    },
    {
      label: 'Audience',
      render: (a) => (
        <span className="text-fg-2">{getAudienceLabel(a.audience, courses ?? [], groups ?? [])}</span>
      ),
    },
    {
      label: 'Status',
      render: (a) =>
        a.publishedAt === null ? (
          <Tag tone="amber">Draft</Tag>
        ) : (
          <Tag tone="green">Sent</Tag>
        ),
    },
    {
      label: 'Recipients',
      align: 'end',
      render: (a) => (
        <span className="text-fg-2">{a.publishedAt === null ? '—' : a.recipientCount}</span>
      ),
    },
    {
      label: 'Date',
      align: 'end',
      render: (a) => (
        <span className="text-fg-3">
          {a.publishedAt ? formatDate(a.publishedAt) : formatDate(a.createdAt)}
        </span>
      ),
    },
    {
      align: 'end',
      render: (a) => (
        <div className="flex items-center justify-end gap-2">
          <Button
            size="small"
            onClick={() => {
              setComposing(false);
              setEditingAnnouncement(a);
            }}
          >
            Edit
          </Button>
          {a.publishedAt === null && admin && (
            <Button
              size="small"
              variant="primary"
              disabled={actionBusy}
              onClick={() => handlePublish(a)}
            >
              Publish
            </Button>
          )}
          {a.publishedAt === null && (
            <Button
              size="small"
              variant="tertiary"
              disabled={actionBusy}
              onClick={() => handleDelete(a)}
            >
              Delete
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle title="Announcements" />
      <div className="flex flex-col gap-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-fg-2">
            {admin ? 'All announcements' : 'Held courses and groups'}
            {announcements && <> · <span className="num">{announcements.length}</span></>}
          </span>

          {!composing && !editingAnnouncement && (
            <Button
              variant="primary"
              icon="Plus"
              onClick={() => {
                setEditingAnnouncement(null);
                setComposing(true);
              }}
            >
              New announcement
            </Button>
          )}
        </div>

        {actionError && <InlineBanner tone="danger">{actionError}</InlineBanner>}

        {(composing || editingAnnouncement) && (
          <Panel
            title={
              editingAnnouncement
                ? editingAnnouncement.publishedAt !== null
                  ? 'Edit announcement'
                  : 'Edit draft'
                : 'New announcement'
            }
            action={
              <Button
                size="small"
                variant="tertiary"
                onClick={() => {
                  setComposing(false);
                  setEditingAnnouncement(null);
                }}
              >
                Close
              </Button>
            }
          >
            <ComposeAnnouncementForm
              initialAnnouncement={editingAnnouncement}
              courses={courses ?? []}
              groups={groups ?? []}
              admin={admin}
              onDone={() => {
                setComposing(false);
                setEditingAnnouncement(null);
                reload();
              }}
              onCancel={() => {
                setComposing(false);
                setEditingAnnouncement(null);
              }}
            />
          </Panel>
        )}

        <Panel padded={false}>
          <TableToolbar
            filters={
              <>
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
              </>
            }
          />

          {loading && !announcements && (
            <div className="flex justify-center p-8">
              <Loader label="Loading announcements" />
            </div>
          )}

          {error && (
            <EmptyState
              icon="AlertTriangle"
              title={error.message}
              action={<Button onClick={reload}>Try again</Button>}
            />
          )}

          {announcements && (
            <Table
              columns={columns}
              rows={announcements ?? []}
              rowKey={(a) => a.id}
              empty={
                <EmptyState
                  icon="Message"
                  title="No announcements match"
                  description="Announcements created for your scope appear here."
                />
              }
            />
          )}
        </Panel>
      </div>
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
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user, token } = useSession();
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

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      if (!mediaKind || mediaKind === 'youtube') {
        if (res.kind === 'image') setMediaKind('image');
        else if (res.kind === 'video') setMediaKind('video');
        else setMediaKind('file');
      }
    } catch (err) {
      setUploadError(err instanceof ApiError ? err.message : 'Could not upload file.');
    } finally {
      setUploading(false);
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

      onDone();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not save announcement.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Compose Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit(false);
        }}
        className="flex flex-col gap-4"
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

        <div className="flex flex-col gap-3">
          <Select
            label="Media attachment"
            value={mediaKind}
            onChange={(e) => {
              const k = e.target.value as 'image' | 'video' | 'youtube' | 'file' | '';
              setMediaKind(k);
              if (!k) setMediaUrl('');
            }}
            options={[
              { value: '', label: 'None' },
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
              { value: 'youtube', label: 'YouTube' },
              { value: 'file', label: 'Document / File' },
            ]}
          />

          {mediaKind === 'youtube' && (
            <TextInput
              label="YouTube video URL"
              value={mediaUrl}
              onChange={(e) => setMediaUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              hint="Paste a public YouTube video URL"
            />
          )}

          {(mediaKind === 'image' || mediaKind === 'video' || mediaKind === 'file') && (
            <div className="flex flex-col gap-2">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <TextInput
                    label="Media URL or path"
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    placeholder="Upload a file or enter URL"
                    hint="Upload a file or enter an http(s) URL"
                  />
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                    accept={
                      mediaKind === 'image'
                        ? 'image/*'
                        : mediaKind === 'video'
                          ? 'video/*'
                          : undefined
                    }
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader label="Uploading" /> : 'Upload file'}
                  </Button>
                </div>
              </div>
              {uploadError && <InlineBanner tone="danger">{uploadError}</InlineBanner>}
            </div>
          )}
        </div>

        {formError && <InlineBanner tone="danger">{formError}</InlineBanner>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button type="button" variant="tertiary" onClick={onCancel}>
            Cancel
          </Button>

          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => handleSubmit(false)}
          >
            {isPublished ? 'Save changes' : 'Save draft'}
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

      {/* Student View Preview */}
      <div className="flex flex-col gap-2">
        <span className="font-medium text-fg-2">Student preview</span>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <Tag tone="blue">Announcement</Tag>
            <span className="text-fg-3">{formatDate(new Date().toISOString())}</span>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="font-semibold text-fg">{title.trim() || 'Untitled announcement'}</h3>
            <div className="flex items-center gap-2 text-fg-3">
              <Avatar name={user?.name ?? 'Teacher'} size={24} />
              <span>{user?.name ?? 'Teacher'}</span>
              <span>·</span>
              <span>{getAudienceLabel(audience, courses, groups)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {body.trim() ? (
              body
                .split('\n\n')
                .map((p) => p.trim())
                .filter(Boolean)
                .map((p, idx) => (
                  <p key={idx} className="leading-relaxed text-fg whitespace-pre-line">
                    {p}
                  </p>
                ))
            ) : (
              <p className="italic text-fg-3">Announcement body preview will appear here.</p>
            )}
          </div>

          {mediaKind && mediaUrl.trim() && (
            <div className="pt-2">
              {mediaKind === 'image' && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={mediaSrc(mediaUrl.trim())}
                  alt={title || 'Announcement media'}
                  className="max-h-[320px] w-full rounded-lg border border-border object-cover"
                />
              )}
              {mediaKind === 'video' && (
                <video
                  controls
                  src={mediaSrc(mediaUrl.trim())}
                  className="max-h-[320px] w-full rounded-lg border border-border"
                />
              )}
              {mediaKind === 'youtube' &&
                (() => {
                  const embed = getYoutubeEmbedUrl(mediaUrl.trim());
                  return embed ? (
                    <div className="aspect-video w-full overflow-hidden rounded-lg border border-border">
                      <iframe
                        src={embed}
                        title="YouTube video"
                        className="h-full w-full"
                        allowFullScreen
                      />
                    </div>
                  ) : (
                    <a
                      href={mediaUrl.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 font-medium text-accent hover:underline"
                    >
                      <Icon name="PlayerPlay" size={16} /> Watch on YouTube
                    </a>
                  );
                })()}
              {mediaKind === 'file' && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-bg-2 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon name="FileText" size={20} className="text-fg-2" />
                    <span className="truncate font-medium text-fg">
                      {mediaUrl.split('/').pop() || 'Attached file'}
                    </span>
                  </div>
                  <a
                    href={mediaSrc(mediaUrl.trim())}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-accent hover:underline"
                  >
                    Download
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
