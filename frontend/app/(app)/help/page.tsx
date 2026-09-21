'use client';

import { CONTACT } from '@/lib/site-content';
import { Panel, Button, Icon } from '@/components/ui';
import { PageTitle } from '@/components/app/page-chrome';

/**
 * Help (`docs/PRODUCT_SPEC.md` §6: "WhatsApp card. Frontend + config only.").
 *
 * No backend for this screen exists or is planned — it is a static card
 * pointing at the same `CONTACT.whatsappUrl` the marketing contact page and
 * footer already use, so there is exactly one place a real number ever gets
 * set.
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
            <Button
              variant="primary"
              onClick={() =>
                window.open(CONTACT.whatsappUrl, '_blank', 'noopener,noreferrer')
              }
            >
              <Icon name="MessageCircle" size={14} />
              Open WhatsApp
            </Button>
          </div>
        </Panel>
      </div>
    </>
  );
}
