import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service.js';
import type { MailInput, MailSender } from './mail-sender.interface.js';
import { MAIL_SENDER } from './mail-sender.interface.js';
import type { MailDeliveryRepository } from './mail-delivery.repository.js';
import { MAIL_DELIVERY_REPOSITORY } from './mail-delivery.repository.js';

@Injectable()
export class MailService {
  constructor(
    @Inject(MAIL_SENDER) private readonly sender: MailSender | null,
    @Inject(MAIL_DELIVERY_REPOSITORY)
    private readonly deliveries: MailDeliveryRepository,
    private readonly db: DatabaseService,
  ) {}

  /**
   * Sends a mail and records the delivery.
   *
   * - 503 when the sender is null (`MAIL_DRIVER=none`).
   * - Throws when called outside `DatabaseService.runInTransaction`, mirroring
   *   `AuditService.record` - the delivery row and the action that triggered
   *   the send must commit together.
   * - The delivery row stores recipient and template only, never `data` or
   *   the rendered subject/html.
   */
  async send(input: MailInput): Promise<void> {
    if (!this.sender) {
      throw new ServiceUnavailableException(
        'Mail is not configured on this server.',
      );
    }
    if (!this.db.inTransaction) {
      throw new Error(
        `Refusing to send mail (template="${input.template}") outside a ` +
          'transaction. The delivery row and the action that triggered it ' +
          'must commit together; wrap both in `DatabaseService.runInTransaction`.',
      );
    }
    await this.sender.send(input);
    await this.deliveries.record({
      id: randomUUID(),
      recipient: input.to,
      template: input.template,
      created_at: new Date(),
    });
  }
}
