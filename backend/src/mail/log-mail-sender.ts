import { Injectable, Logger } from '@nestjs/common';
import type { MailInput, MailSender } from './mail-sender.interface.js';

/**
 * Logs the template name and nothing else.
 *
 * `to` is PII and `data` may carry a live token - neither belongs in a log
 * aggregator. This mirrors `LoggingPasswordResetNotifier`'s approach but is
 * stricter: it does not even log the expiry.
 */
@Injectable()
export class LogMailSender implements MailSender {
  private readonly logger = new Logger(LogMailSender.name);

  async send(input: MailInput): Promise<void> {
    this.logger.log(`[mail] template=${input.template}`);
  }
}
