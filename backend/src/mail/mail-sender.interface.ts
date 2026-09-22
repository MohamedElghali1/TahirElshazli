/**
 * The mail transport, behind an interface.
 *
 * Mirrors `FileStorage` (`backend/src/common/storage/file-storage.interface.ts`):
 * a port that the module resolves to a concrete driver at boot, or to `null`
 * when no driver is configured (`MAIL_DRIVER=none`). `MailService` answers 503
 * in that case, exactly as `UploadsService` does for `FILE_STORAGE`.
 */

export type MailTemplate =
  | 'password-reset'
  | 'invitation'
  | 'sign-in-link'
  | 'report'
  | 'announcement';

export interface MailInput {
  to: string;
  template: MailTemplate;
  data: Record<string, unknown>;
}

export interface MailSender {
  send(input: MailInput): Promise<void>;
}

export const MAIL_SENDER = Symbol('MAIL_SENDER');
