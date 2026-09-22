import { Module, Logger } from '@nestjs/common';
import { MailService } from './mail.service.js';
import { LogMailSender } from './log-mail-sender.js';
import { SmtpMailSender } from './smtp-mail-sender.js';
import type { MailSender } from './mail-sender.interface.js';
import { MAIL_SENDER } from './mail-sender.interface.js';
import { MAIL_DELIVERY_REPOSITORY } from './mail-delivery.repository.js';
import { InMemoryMailDeliveryRepository } from './in-memory-mail-delivery.repository.js';
import { PostgresMailDeliveryRepository } from './postgres-mail-delivery.repository.js';
import { repositoryProvider } from '../database/repository.provider.js';
import type { MailDeliveryRepository } from './mail-delivery.repository.js';
import {
  resolveMailDriver,
  resolveNodeEnv,
  resolveSmtpConfig,
} from '../common/config/env.js';

/**
 * **Not `@Global()`.** CLAUDE.md §5 caps global modules at three
 * (`DatabaseModule`, `AuditModule`, `GroupDataModule`). `AuthModule` imports
 * this explicitly; future consumers (units 5/9/10) will do the same.
 */
@Module({
  providers: [
    MailService,
    LogMailSender,
    InMemoryMailDeliveryRepository,
    PostgresMailDeliveryRepository,
    repositoryProvider<MailDeliveryRepository>(
      MAIL_DELIVERY_REPOSITORY,
      InMemoryMailDeliveryRepository,
      PostgresMailDeliveryRepository,
    ),
    {
      provide: MAIL_SENDER,
      inject: [LogMailSender],
      useFactory: (log: LogMailSender): MailSender | null => {
        const driver = resolveMailDriver(resolveNodeEnv());
        switch (driver) {
          case 'log':
            new Logger('MailModule').log(
              'MAIL_DRIVER=log: mails are logged, not sent.',
            );
            return log;
          case 'smtp': {
            const config = resolveSmtpConfig();
            return new SmtpMailSender(config);
          }
          case 'none':
          default:
            return null;
        }
      },
    },
  ],
  exports: [MailService],
})
export class MailModule {}
