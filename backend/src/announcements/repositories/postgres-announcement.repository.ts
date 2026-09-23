import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso } from '../../database/database.types.js';
import { encodeAudience } from '../announcement-audience.js';
import type { AnnouncementAudienceType } from '../announcement-audience.js';
import type {
  Announcement,
  AnnouncementRepository,
  NewAnnouncement,
} from '../interfaces/announcement-repository.interface.js';

interface AnnouncementRow {
  id: string;
  audience_type: AnnouncementAudienceType;
  course_id: string | null;
  group_id: string | null;
  title: string;
  body: string;
  media_kind: 'image' | 'video' | 'youtube' | 'file' | null;
  media_url: string | null;
  posted_by: string;
  created_at: Date;
  published_at: Date | null;
  recipient_count: number;
}

const COLUMNS =
  'id, audience_type, course_id, group_id, title, body, media_kind, media_url, posted_by, created_at, published_at, recipient_count';

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    audience: encodeAudience({
      type: row.audience_type,
      courseId: row.course_id,
      groupId: row.group_id,
    }),
    audienceType: row.audience_type,
    courseId: row.course_id,
    groupId: row.group_id,
    title: row.title,
    body: row.body,
    mediaKind: row.media_kind,
    mediaUrl: row.media_url,
    postedBy: row.posted_by,
    createdAt: iso(row.created_at),
    publishedAt: row.published_at ? iso(row.published_at) : null,
    recipientCount: row.recipient_count,
  };
}

@Injectable()
export class PostgresAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: NewAnnouncement): Promise<Announcement> {
    const row = await this.db.queryOne<AnnouncementRow>(
      `INSERT INTO announcements
         (id, audience_type, course_id, group_id, title, body, media_kind, media_url, posted_by, recipient_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${COLUMNS}`,
      [
        randomUUID(),
        input.audienceType,
        input.courseId,
        input.groupId,
        input.title,
        input.body,
        input.mediaKind,
        input.mediaUrl,
        input.postedBy,
        input.recipientCount,
      ],
    );
    if (!row) throw new Error('announcements INSERT returned no row');
    return toAnnouncement(row);
  }

  async findById(id: string): Promise<Announcement | null> {
    const row = await this.db.queryOne<AnnouncementRow>(
      `SELECT ${COLUMNS} FROM announcements WHERE id = $1`,
      [id]
    );
    return row ? toAnnouncement(row) : null;
  }

  async publish(id: string, recipientCount: number): Promise<Announcement | null> {
    const row = await this.db.queryOne<AnnouncementRow>(
      `UPDATE announcements 
       SET published_at = now(), recipient_count = $2 
       WHERE id = $1 AND published_at IS NULL 
       RETURNING ${COLUMNS}`,
      [id, recipientCount]
    );
    return row ? toAnnouncement(row) : null;
  }

  async update(id: string, patch: Partial<Omit<Announcement, 'id' | 'createdAt' | 'publishedAt' | 'recipientCount' | 'audience'>>): Promise<Announcement | null> {
    const sets: string[] = [];
    const vals: any[] = [id];
    let i = 2;

    if (patch.audienceType !== undefined) { sets.push(`audience_type = $${i++}`); vals.push(patch.audienceType); }
    if (patch.courseId !== undefined) { sets.push(`course_id = $${i++}`); vals.push(patch.courseId); }
    if (patch.groupId !== undefined) { sets.push(`group_id = $${i++}`); vals.push(patch.groupId); }
    if (patch.title !== undefined) { sets.push(`title = $${i++}`); vals.push(patch.title); }
    if (patch.body !== undefined) { sets.push(`body = $${i++}`); vals.push(patch.body); }
    if (patch.mediaKind !== undefined) { sets.push(`media_kind = $${i++}`); vals.push(patch.mediaKind); }
    if (patch.mediaUrl !== undefined) { sets.push(`media_url = $${i++}`); vals.push(patch.mediaUrl); }

    if (sets.length === 0) return this.findById(id);

    const row = await this.db.queryOne<AnnouncementRow>(
      `UPDATE announcements SET ${sets.join(', ')} WHERE id = $1 RETURNING ${COLUMNS}`,
      vals
    );
    return row ? toAnnouncement(row) : null;
  }

  async remove(id: string): Promise<boolean> {
    // `DatabaseService` returns rows, not a `rowCount`, so the delete says what it removed.
    const row = await this.db.queryOne<{ id: string }>(
      `DELETE FROM announcements WHERE id = $1 AND published_at IS NULL RETURNING id`,
      [id],
    );
    return row !== null;
  }

  private statusCondition(status?: 'draft' | 'published', paramIndex = 1): string {
    if (status === 'draft') return `AND published_at IS NULL`;
    if (status === 'published') return `AND published_at IS NOT NULL`;
    return '';
  }

  async findByGroup(
    groupId: string,
    limit: number,
    offset: number,
    status?: 'draft' | 'published',
  ): Promise<Announcement[]> {
    const rows = await this.db.query<AnnouncementRow>(
      `SELECT ${COLUMNS} FROM announcements
       WHERE group_id = $1 ${this.statusCondition(status)}
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [groupId, limit, offset],
    );
    return rows.map(toAnnouncement);
  }

  async findByCourse(
    courseId: string,
    limit: number,
    offset: number,
    status?: 'draft' | 'published',
  ): Promise<Announcement[]> {
    const rows = await this.db.query<AnnouncementRow>(
      `SELECT ${COLUMNS} FROM announcements
       WHERE course_id = $1 ${this.statusCondition(status)}
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [courseId, limit, offset],
    );
    return rows.map(toAnnouncement);
  }

  async findAll(limit: number, offset: number, status?: 'draft' | 'published'): Promise<Announcement[]> {
    const rows = await this.db.query<AnnouncementRow>(
      `SELECT ${COLUMNS} FROM announcements
       WHERE 1=1 ${this.statusCondition(status)}
       ORDER BY COALESCE(published_at, created_at) DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(toAnnouncement);
  }
}
