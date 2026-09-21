import { renderTemplate } from './templates.js';
import type { MailTemplate } from './mail-sender.interface.js';

const cases: [MailTemplate, Record<string, unknown>][] = [
  ['password-reset', { token: 'tok-123', expiresAt: '2026-12-31T23:59:59Z' }],
  ['invitation', { inviterName: 'Dr. Tahir', groupName: 'Saturday', link: 'https://example.com/accept' }],
  ['sign-in-link', { link: 'https://example.com/sign-in', expiresAt: '2026-12-31T23:59:59Z' }],
  ['report', { title: 'Weekly Report', body: 'Good progress.' }],
  ['announcement', { title: 'New Schedule', body: 'Classes start Monday.' }],
];

describe('renderTemplate', () => {
  it.each(cases)(
    '%s produces non-empty subject and html',
    (template, data) => {
      const result = renderTemplate(template, data);
      expect(result.subject).toBeTruthy();
      expect(result.html).toBeTruthy();
    },
  );

  it('password-reset includes the token in the html', () => {
    const result = renderTemplate('password-reset', { token: 'secret-token', expiresAt: 'tomorrow' });
    expect(result.html).toContain('secret-token');
  });

  it('invitation includes the group name in the subject', () => {
    const result = renderTemplate('invitation', { inviterName: 'X', groupName: 'Saturday', link: 'y' });
    expect(result.subject).toContain('Saturday');
  });
});
