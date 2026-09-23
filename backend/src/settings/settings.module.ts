import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { SettingsController } from './settings.controller.js';
import { SettingsService } from './settings.service.js';
import { repositoryProvider } from '../database/repository.provider.js';
import { NOTIFICATION_PREFERENCES_REPOSITORY } from './interfaces/notification-preferences-repository.interface.js';
import type { NotificationPreferencesRepository } from './interfaces/notification-preferences-repository.interface.js';
import { InMemoryNotificationPreferencesRepository } from './repositories/in-memory-notification-preferences.repository.js';
import { PostgresNotificationPreferencesRepository } from './repositories/postgres-notification-preferences.repository.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SettingsController],
  providers: [
    SettingsService,
    InMemoryNotificationPreferencesRepository,
    PostgresNotificationPreferencesRepository,
    repositoryProvider<NotificationPreferencesRepository>(
      NOTIFICATION_PREFERENCES_REPOSITORY,
      InMemoryNotificationPreferencesRepository,
      PostgresNotificationPreferencesRepository,
    ),
  ],
})
export class SettingsModule {}
