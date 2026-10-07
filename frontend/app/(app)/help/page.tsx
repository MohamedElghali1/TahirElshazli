import { CONTACT } from '@/lib/site-content';
import { PageTitle } from '@/components/shell/page-chrome';
import { ClIcon } from '@/components/shell/classroom';

/**
 * Help (`docs/PRODUCT_SPEC.md` §6: "WhatsApp card. Frontend + config only.").
 * A static card pointing at the same `CONTACT.whatsappUrl` the marketing site
 * uses. The call to action is an anchor, not a `window.open` button: it can be
 * middle-clicked and is not suppressed by a popup blocker, and it keeps this a
 * server component.
 */
export default function HelpPage() {
  return (
    <>
      <PageTitle title="Help" />
      <section aria-labelledby="h-help" className="cl-panel">
        <div className="cl-ph">
          <h2 id="h-help" className="cl-pt">
            Need something?
          </h2>
        </div>
        <div className="cl-grow" style={{ cursor: 'default', flexWrap: 'wrap' }}>
          <span className="cl-ic40 cl-ic56 cl-tone-mint">
            <ClIcon name="help" />
          </span>
          <p className="cl-grow-main m-0 min-w-[240px] text-[15px] leading-relaxed">
            Message Dr. Tahir and the team directly on WhatsApp for anything this console cannot answer — a missed
            class, a billing question, a technical problem.
          </p>
          <a href={CONTACT.whatsappUrl} target="_blank" rel="noopener noreferrer" className="cl-btnp cl-btnp--lg">
            Open WhatsApp
          </a>
        </div>
      </section>
    </>
  );
}
