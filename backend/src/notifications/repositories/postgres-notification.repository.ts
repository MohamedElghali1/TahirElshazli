import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type {
  NewNotification,
  Notification,
  NotificationRepository,
  NotificationType,
} from '../interfaces/notification-repository.interface.js';

interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  link: string | null;
  read: boolean;
  created_at: Date;
}

const COLUMNS = 'id, user_id, type, title, message, link, read, created_at';

function toNotification(row: NotificationRow): Notification {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    read: row.read,
    createdAt: iso(row.created_at),
  };
}

@Injectable()
export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly db: DatabaseService) {}

  async findByUser(userId: string, unreadOnly: boolean): Promise<Notification[]> {
    const rows = await this.db.query<NotificationRow>(
      `SELECT ${COLUMNS}
       FROM notifications
       WHERE user_id = $1
         AND ($2::boolean IS NOT TRUE OR read = false)
       ORDER BY created_at DESC`,
      [userId, unreadOnly],
    );
    return rows.map(toNotification);
  }

  /**
   * One INSERT for the whole audience, built from parallel arrays rather than
   * a generated `VALUES ($1,$2,...),($7,$8,...)` list.
   *
   * `unnest` keeps this a *fixed* six-parameter statement whatever the
   * recipient count, so nothing about the SQL text depends on user input
   * (CLAUDE.md §8) and Postgres can reuse the plan. A concatenated VALUES list
   * would also hit the 65535-parameter ceiling at ~10k recipients, which is
   * inside the "thousands of students" §1 targets.
   */
  async createMany(notifications: readonly NewNotification[]): Promise<number> {
    if (notifications.length === 0) {
      // `unnest` of empty arrays inserts nothing, but the round trip is still
      // a round trip - and an announcement to an empty audience is normal.
      return 0;
    }
    const rows = await this.db.query<{ id: string }>(
      `INSERT INTO notifications (id, user_id, type, title, message, link)
       SELECT * FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]
       )
       RETURNING id`,
      [
        notifications.map(() => randomUUID()),
        notifications.map((n) => n.userId),
        notifications.map((n) => n.type),
        notifications.map((n) => n.title),
        notifications.map((n) => n.message),
        notifications.map((n) => n.link),
      ],
    );
    return rows.length;
  }

  /**
   * `user_id = $2` in the WHERE clause is the authorization check, not a
   * convenience filter: without it any authenticated student could mark any
   * other student's notification read by guessing an id. Matching no row
   * returns null, which the service turns into a 404.
   */
  async markRead(
    notificationId: string,
    userId: string,
  ): Promise<Notification | null> {
    const row = await this.db.queryOne<NotificationRow>(
      `UPDATE notifications
       SET read = true
       WHERE id = $1 AND user_id = $2
       RETURNING ${COLUMNS}`,
      [notificationId, userId],
    );
    return row ? toNotification(row) : null;
  }

  async markAllRead(userId: string): Promise<number> {
    const rows = await this.db.query<{ id: string }>(
      'UPDATE notifications SET read = true WHERE user_id = $1 AND read = false RETURNING id',
      [userId],
    );
    return rows.length;
  }

  async countUnread(userId: string): Promise<number> {
    // Served by the partial index `notifications_unread_idx`, so the badge does
    // not scan the read rows - which are the ones that pile up over a term.
    const row = await this.db.queryOne<{ count: string }>(
      'SELECT count(*) AS count FROM notifications WHERE user_id = $1 AND read = false',
      [userId],
    );
    return row ? num(row.count) : 0;
  }
}
