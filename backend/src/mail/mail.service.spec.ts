import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service.js';
import { MAIL_SENDER } from './mail-sender.interface.js';
import type { MailInput, MailSender } from './mail-sender.interface.js';
import { MAIL_DELIVERY_REPOSITORY } from './mail-delivery.repository.js';
import { InMemoryMailDeliveryRepository } from './in-memory-mail-delivery.repository.js';
import { DatabaseService } from '../database/database.service.js';
import { DATABASE_POOL } from '../database/database.tokens.js';

const input: MailInput = {
  to: 'user@example.com',
  template: 'password-reset',
  data: { token: 'abc', expiresAt: '2026-12-31' },
};

describe('MailService', () => {
  let service: MailService;
  let db: DatabaseService;
  let sender: MailSender;

  describe('with a configured sender', () => {
    beforeEach(async () => {
      sender = { send: vi.fn().mockResolvedValue(undefined) };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          DatabaseService,
          { provide: DATABASE_POOL, useValue: null },
          { provide: MAIL_SENDER, useValue: sender },
          { provide: MAIL_DELIVERY_REPOSITORY, useClass: InMemoryMailDeliveryRepository },
        ],
      }).compile();

      service = module.get(MailService);
      db = module.get(DatabaseService);
    });

    it('throws outside a transaction, mirroring AuditService.record', async () => {
      await expect(service.send(input)).rejects.toThrow(
        /outside a transaction/,
      );
    });

    it('calls sender.send and records the delivery inside a transaction', async () => {
      await db.runInTransaction(() => service.send(input));

      expect(sender.send).toHaveBeenCalledTimes(1);
      expect(sender.send).toHaveBeenCalledWith(input);
    });
  });

  describe('with no sender (driver=none)', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailService,
          DatabaseService,
          { provide: DATABASE_POOL, useValue: null },
          { provide: MAIL_SENDER, useValue: null },
          { provide: MAIL_DELIVERY_REPOSITORY, useClass: InMemoryMailDeliveryRepository },
        ],
      }).compile();

      service = module.get(MailService);
      db = module.get(DatabaseService);
    });

    it('throws 503 ServiceUnavailableException', async () => {
      await expect(
        db.runInTransaction(() => service.send(input)),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });
});
