import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationPreferences, NotificationPreferencesRepository } from '../interfaces/notification-preferences-repository.interface.js';

@Injectable()
export class PostgresNotificationPreferencesRepository implements NotificationPreferencesRepository {
  constructor(private readonly db: DatabaseService) {}

  async get(userId: string): Promise<NotificationPreferences> {
    const result = await this.db.query<{
      submissions: boolean;
      registrations: boolean;
      unmatched: boolean;
      weekly_summary: boolean;
    }>(
      `SELECT submissions, registrations, unmatched, weekly_summary
         FROM notification_preferences
        WHERE user_id = $1`,
      [userId],
    );

    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        submissions: row.submissions,
        registrations: row.registrations,
        unmatched: row.unmatched,
        weeklySummary: row.weekly_summary,
      };
    }

    return {
      submissions: true,
      registrations: true,
      unmatched: true,
      weeklySummary: true,
    };
  }

  async upsert(userId: string, prefs: NotificationPreferences): Promise<void> {
    await this.db.query(
      `INSERT INTO notification_preferences (user_id, submissions, registrations, unmatched, weekly_summary, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (user_id) DO UPDATE SET
         submissions = EXCLUDED.submissions,
         registrations = EXCLUDED.registrations,
         unmatched = EXCLUDED.unmatched,
         weekly_summary = EXCLUDED.weekly_summary,
         updated_at = now()`,
      [userId, prefs.submissions, prefs.registrations, prefs.unmatched, prefs.weeklySummary],
    );
  }
}
