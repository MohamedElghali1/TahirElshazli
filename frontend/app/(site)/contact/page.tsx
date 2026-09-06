import type { Metadata } from 'next';
import { EnvelopeSimpleIcon, WhatsappLogoIcon } from '@phosphor-icons/react/dist/ssr';
import { ContactForm } from '@/components/site/contact-form';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Ask about IGCSE and IELTS courses with Dr. Tahir Elshazli: timetables, exam boards, fees and available places.',
};

const shell = 'mx-auto w-full max-w-[var(--maxw-site)] px-[var(--sp-6)]';

export default function ContactPage() {
  return (
    <section className={`${shell} grid gap-[var(--sp-16)] py-[var(--sp-16)] lg:grid-cols-[4fr_5fr] lg:py-[var(--sp-24)]`}>
      <div>
        <h1 className="max-w-[14ch] text-[clamp(2.25rem,5vw,var(--fs-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-[var(--fg-primary)]">
          Ask about a place.
        </h1>
        <p className="mt-[var(--sp-6)] max-w-[46ch] text-[var(--fs-lead)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
          Tell us the year group and the exam board, and we will come back with
          the timetable, the papers covered and the fee.
        </p>

        <div className="mt-[var(--sp-12)] flex flex-col gap-[var(--sp-4)] border-t border-[var(--border-light)] pt-[var(--sp-8)]">
          <a
            href="https://wa.me/201000000000"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-[var(--sp-3)] text-[var(--fs-body)] text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
          >
            <WhatsappLogoIcon size={20} className="text-[var(--fg-tertiary)]" />
            WhatsApp
          </a>
          <a
            href="mailto:hello@tahirelshazli.com"
            className="inline-flex items-center gap-[var(--sp-3)] text-[var(--fs-body)] text-[var(--fg-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--fg-primary)]"
          >
            <EnvelopeSimpleIcon size={20} className="text-[var(--fg-tertiary)]" />
            hello@tahirelshazli.com
          </a>
        </div>
      </div>

      <ContactForm />
    </section>
  );
}
