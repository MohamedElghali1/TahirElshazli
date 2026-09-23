export const NOTIFICATION_PREFERENCES_REPOSITORY = Symbol('NOTIFICATION_PREFERENCES_REPOSITORY');

export interface NotificationPreferences {
  submissions: boolean;
  registrations: boolean;
  unmatched: boolean;
  weeklySummary: boolean;
}

export interface NotificationPreferencesRepository {
  /**
   * Retrieves the user's notification preferences.
   * If no preferences exist, returns a default object with all booleans set to true.
   */
  get(userId: string): Promise<NotificationPreferences>;
  
  /**
   * Replaces the user's notification preferences.
   */
  upsert(userId: string, prefs: NotificationPreferences): Promise<void>;
}
