import { Test } from '@nestjs/testing';
import { SettingsService } from './settings.service.js';
import { USER_REPOSITORY } from '../auth/interfaces/user-repository.interface.js';
import { NOTIFICATION_PREFERENCES_REPOSITORY } from './interfaces/notification-preferences-repository.interface.js';
import { InMemoryUserRepository } from '../auth/repositories/in-memory-user.repository.js';
import { InMemoryNotificationPreferencesRepository } from './repositories/in-memory-notification-preferences.repository.js';

describe('SettingsService', () => {
  let service: SettingsService;
  let users: InMemoryUserRepository;
  let prefs: InMemoryNotificationPreferencesRepository;

  beforeEach(async () => {
    users = new InMemoryUserRepository();
    prefs = new InMemoryNotificationPreferencesRepository();
    
    await users.create({
      email: 'test@example.com',
      passwordHash: 'hash',
      name: 'Test Staff',
      role: 'teacher' as any,
      status: 'active',
    });
    const user = await users.findByEmail('test@example.com');
    if (user) {
      await users.updateName(user.id, 'Original Name');
    }

    const module = await Test.createTestingModule({
      providers: [
        SettingsService,
        { provide: USER_REPOSITORY, useValue: users },
        { provide: NOTIFICATION_PREFERENCES_REPOSITORY, useValue: prefs },
      ],
    }).compile();

    service = module.get(SettingsService);
  });

  describe('profile', () => {
    it('returns the profile', async () => {
      const user = await users.findByEmail('test@example.com');
      const profile = await service.getProfile(user!.id);
      expect(profile.name).toBe('Original Name');
      expect(profile.email).toBe('test@example.com');
    });

    it('updates the name', async () => {
      const user = await users.findByEmail('test@example.com');
      await service.updateProfile(user!.id, { name: 'New Name' });
      const profile = await service.getProfile(user!.id);
      expect(profile.name).toBe('New Name');
    });
  });

  describe('notification preferences', () => {
    it('returns defaults if none exist', async () => {
      const p = await service.getNotificationPreferences('some-id');
      expect(p).toEqual({
        submissions: true,
        registrations: true,
        unmatched: true,
        weeklySummary: true,
      });
    });

    it('upserts and retrieves preferences', async () => {
      await service.updateNotificationPreferences('some-id', {
        submissions: false,
        registrations: true,
        unmatched: false,
        weeklySummary: false,
      });

      const p = await service.getNotificationPreferences('some-id');
      expect(p).toEqual({
        submissions: false,
        registrations: true,
        unmatched: false,
        weeklySummary: false,
      });
    });
  });
});
