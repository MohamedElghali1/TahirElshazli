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
  title: string;
  body: string;
  posted_by: string;
  posted_at: Date;
  recipient_count: number;
}

const COLUMNS =
  'id, audience_type, course_id, title, body, posted_by, posted_at, recipient_count';

function toAnnouncement(row: AnnouncementRow): Announcement {
  return {
    id: row.id,
    audience: encodeAudience({
      type: row.audience_type,
      courseId: row.course_id,
    }),
    audienceType: row.audience_type,
    courseId: row.course_id,
    title: row.title,
    body: row.body,
    postedBy: row.posted_by,
    postedAt: iso(row.posted_at),
    recipientCount: row.recipient_count,
  };
}

/**
 * Insert-and-read only. There is no UPDATE and no DELETE here, and that is a
 * decision rather than an omission: an announcement has already been delivered
 * into people's notification feeds by the time it exists as a row, and neither
 * editing nor deleting it can recall those. A retraction is a second
 * announcement.
 */
@Injectable()
export class PostgresAnnouncementRepository implements AnnouncementRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(input: NewAnnouncement): Promise<Announcement> {
    const row = await this.db.queryOne<AnnouncementRow>(
      `INSERT INTO announcements
         (id, audience_type, course_id, title, body, posted_by, recipient_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${COLUMNS}`,
      [
        randomUUID(),
        input.audienceType,
        input.courseId,
        input.title,
        input.body,
        input.postedBy,
        input.recipientCount,
      ],
    );
    if (!row) {
      throw new Error('announcements INSERT returned no row');
    }
    return toAnnouncement(row);
  }

  async findByCourse(
    courseId: string,
    limit: number,
    offset: number,
  ): Promise<Announcement[]> {
    // `(posted_at DESC, id DESC)` matches `announcements_course_posted_at_idx`
    // and breaks ties deterministically, so a page boundary cannot land in the
    // middle of two announcements sharing a millisecond and show one twice.
    const rows = await this.db.query<AnnouncementRow>(
      `SELECT ${COLUMNS} FROM announcements
       WHERE course_id = $1
       ORDER BY posted_at DESC, id DESC
       LIMIT $2 OFFSET $3`,
      [courseId, limit, offset],
    );
    return rows.map(toAnnouncement);
  }

  async findAll(limit: number, offset: number): Promise<Announcement[]> {
    const rows = await this.db.query<AnnouncementRow>(
      `SELECT ${COLUMNS} FROM announcements
       ORDER BY posted_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows.map(toAnnouncement);
  }
}
