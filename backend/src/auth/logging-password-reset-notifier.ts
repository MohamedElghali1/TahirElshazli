import { Injectable, Logger } from '@nestjs/common';
import type { PasswordResetNotifier } from './interfaces/password-reset-notifier.interface.js';

/**
 * Stand-in until an email transport is configured.
 *
 * The token is a live account-takeover credential and the email is student PII,
 * so neither is written to the log - log aggregation would put both somewhere
 * far less private than "the operator's terminal". Outside development the
 * token is dropped entirely; a real transport replaces this class.
 */
@Injectable()
export class LoggingPasswordResetNotifier implements PasswordResetNotifier {
  private readonly logger = new Logger(LoggingPasswordResetNotifier.name);

  async sendResetToken(
    email: string,
    token: string,
    expiresAt: string,
  ): Promise<void> {
    // Fails closed: printing the token requires someone to switch it on
    // deliberately. Gating on `NODE_ENV === 'production'` instead would leak
    // the token anywhere the variable is simply unset - which includes our own
    // Dockerfile, so the "safe" branch would never have run in the deployment
    // it was written to protect.
    if (process.env.LOG_RESET_TOKENS !== '1') {
      this.logger.warn(
        `Password reset issued but no mail transport is configured; expires=${expiresAt}`,
      );
      return;
    }
    this.logger.debug(`[dev] reset token=${token} expires=${expiresAt}`);
  }
}
