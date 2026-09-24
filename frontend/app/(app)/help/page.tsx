import { CONTACT } from '@/lib/site-content';
import { Panel, ButtonLink, Icon } from '@/components/ui';
import { PageTitle } from '@/components/shell/page-chrome';

/**
 * Help (`docs/PRODUCT_SPEC.md` §6: "WhatsApp card. Frontend + config only.").
 *
 * No backend for this screen exists or is planned — it is a static card
 * pointing at the same `CONTACT.whatsappUrl` the marketing contact page and
 * footer already use, so there is exactly one place a real number ever gets
 * set.
 *
 * The call to action is an anchor, not a button running `window.open`. A
 * button could not be middle-clicked, copied or opened in a new tab, and a
 * scripted `window.open` is the exact shape a popup blocker suppresses —
 * which would have left the one support route on the platform silently doing
 * nothing. Being an anchor also drops the `'use client'` boundary: nothing on
 * this page is interactive any more.
 */
export default function HelpPage() {
  return (
    <>
      <PageTitle title="Help" />
      <div className="p-6">
        <Panel title="Need something?" className="max-w-[480px]">
          <div className="flex flex-col items-start gap-3">
            <Icon name="MessageCircle" size={24} className="text-fg-4" />
            <p className="text-base leading-body text-fg-2">
              Message Dr. Tahir and the team directly on WhatsApp for anything
              this console cannot answer — a missed class, a billing question,
              a technical problem.
            </p>
            <ButtonLink
              href={CONTACT.whatsappUrl}
              variant="primary"
              icon="MessageCircle"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open WhatsApp
            </ButtonLink>
          </div>
        </Panel>
      </div>
    </>
  );
}
