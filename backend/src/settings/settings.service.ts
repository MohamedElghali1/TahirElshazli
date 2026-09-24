import { Inject, Injectable } from '@nestjs/common';
import type { UserRepository } from '../auth/interfaces/user-repository.interface.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import type {
  NotificationPreferences,
  NotificationPreferencesRepository,
} from './interfaces/notification-preferences-repository.interface.js';
import { NOTIFICATION_PREFERENCES_REPOSITORY } from './interfaces/notification-preferences-repository.interface.js';
import { UpdateStaffProfileDto } from './dto/update-staff-profile.dto.js';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto.js';

@Injectable()
export class SettingsService {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly users: UserRepository,
    @Inject(NOTIFICATION_PREFERENCES_REPOSITORY)
    private readonly preferences: NotificationPreferencesRepository,
  ) {}

  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new Error('User not found'); // Handled or unreachable if token is valid
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      googleEmail: user.googleEmail,
    };
  }

  async updateProfile(userId: string, dto: UpdateStaffProfileDto): Promise<void> {
    await this.users.updateName(userId, dto.name);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    return this.preferences.get(userId);
  }

  async updateNotificationPreferences(userId: string, dto: UpdateNotificationPreferencesDto): Promise<void> {
    await this.preferences.upsert(userId, {
      submissions: dto.submissions,
      registrations: dto.registrations,
      unmatched: dto.unmatched,
      weeklySummary: dto.weeklySummary,
    });
  }
}
