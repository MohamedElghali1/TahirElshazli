import type { MailTemplate } from './mail-sender.interface.js';

/**
 * Pure function that renders a mail template to `{ subject, html }`.
 *
 * Only `SmtpMailSender` calls this. `LogMailSender` must not render or log the
 * body. Minimal inline HTML - no templating engine dependency.
 *
 * Data shapes per template are provisional; the real callers (units 5/9/10)
 * may refine them.
 */
export function renderTemplate(
  template: MailTemplate,
  data: Record<string, unknown>,
): { subject: string; html: string } {
  switch (template) {
    case 'password-reset':
      return {
        subject: 'Reset your password',
        html:
          `<p>Use this token to reset your password:</p>` +
          `<p><strong>${String(data.token ?? '')}</strong></p>` +
          `<p>Expires at: ${String(data.expiresAt ?? '')}</p>`,
      };
    case 'invitation':
      return {
        subject: `You've been invited to ${String(data.groupName ?? '')}`,
        html:
          `<p>${String(data.inviterName ?? '')} has invited you to join ` +
          `<strong>${String(data.groupName ?? '')}</strong>.</p>` +
          `<p><a href="${String(data.link ?? '')}">Accept invitation</a></p>`,
      };
    case 'sign-in-link':
      return {
        subject: 'Sign in to your account',
        html:
          `<p>Click below to sign in:</p>` +
          `<p><a href="${String(data.link ?? '')}">Sign in</a></p>` +
          `<p>This link expires at: ${String(data.expiresAt ?? '')}</p>`,
      };
    case 'report':
      return {
        subject: String(data.title ?? 'Your report'),
        html: `<p>${String(data.body ?? '')}</p>`,
      };
    case 'announcement':
      return {
        subject: String(data.title ?? 'Announcement'),
        html: `<p>${String(data.body ?? '')}</p>`,
      };
  }
}
