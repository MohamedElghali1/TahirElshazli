import { Injectable } from '@nestjs/common';
import { NotificationPreferences, NotificationPreferencesRepository } from '../interfaces/notification-preferences-repository.interface.js';

@Injectable()
export class InMemoryNotificationPreferencesRepository implements NotificationPreferencesRepository {
  private readonly store = new Map<string, NotificationPreferences>();

  async get(userId: string): Promise<NotificationPreferences> {
    const prefs = this.store.get(userId);
    if (prefs) {
      return { ...prefs };
    }
    return {
      submissions: true,
      registrations: true,
      unmatched: true,
      weeklySummary: true,
    };
  }

  async upsert(userId: string, prefs: NotificationPreferences): Promise<void> {
    this.store.set(userId, { ...prefs });
  }
}
