import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { iso, num } from '../../database/database.types.js';
import type {
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
