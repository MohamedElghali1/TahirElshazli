import { ButtonLink } from '@/components/ui';

/**
 * The two ways a course grid can have nothing in it. They are deliberately
 * different screens: one is our fault and one is not, and a visitor who is told
 * "no courses available" when the API is simply down has been misinformed about
 * the business.
 *
 * Both keep a route forward. A public page that fails should still be able to
 * take an enquiry.
 */

function Notice({
  heading,
  body,
}: {
  heading: string;
  body: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border-medium)] bg-surface p-12">
      <p className="text-m-lead text-fg">{heading}</p>
      <p className="mt-3 max-w-[52ch] text-m-body leading-[1.65] text-fg-2">
        {body}
      </p>
      <ButtonLink href="/contact" variant="primary" size="medium" className="mt-8">
        Contact us
      </ButtonLink>
    </div>
  );
}

/** The API is unreachable or errored. */
export function CatalogUnavailable() {
  return (
    <Notice
      heading="The course list is not loading right now."
      body="This is on our side, not yours. Send us the year group and the exam board and we will tell you what is running."
    />
  );
}

/** The API answered, and nothing is published. */
export function CatalogEmpty() {
  return (
    <Notice
      heading="No courses are open for enrollment at the moment."
      body="Intakes are set before each term. Tell us what you are preparing for and we will let you know when the next one opens."
    />
  );
}
