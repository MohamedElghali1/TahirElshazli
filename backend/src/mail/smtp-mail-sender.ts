import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { MailInput, MailSender } from './mail-sender.interface.js';
import { renderTemplate } from './templates.js';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

export const SMTP_CONFIG = Symbol('SMTP_CONFIG');

/**
 * Real SMTP transport via `nodemailer`.
 *
 * The only file in this codebase that imports `nodemailer`. Nothing else may
 * depend on it directly - the port interface is what consumers see.
 */
@Injectable()
export class SmtpMailSender implements MailSender {
  private readonly logger = new Logger(SmtpMailSender.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(@Inject(SMTP_CONFIG) config: SmtpConfig) {
    this.transporter = createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
    this.from = config.from;
  }

  async send(input: MailInput): Promise<void> {
    const { subject, html } = renderTemplate(input.template, input.data);
    await this.transporter.sendMail({
      from: this.from,
      to: input.to,
      subject,
      html,
    });
    this.logger.log(`[mail] sent template=${input.template}`);
  }
}
