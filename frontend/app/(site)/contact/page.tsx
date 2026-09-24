import type { Metadata } from 'next';
import { EnvelopeSimpleIcon, WhatsappLogoIcon } from '@phosphor-icons/react/dist/ssr';
import { ContactForm } from '@/components/site/contact-form';
import { CONTACT } from '@/lib/site-content';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Ask about IGCSE and IELTS courses with Dr. Tahir Elshazli: timetables, exam boards, fees and available places.',
};

const shell = 'mx-auto w-full max-w-[1200px] px-6';

export default function ContactPage() {
  return (
    <section className={`${shell} grid gap-16 py-16 lg:grid-cols-[4fr_5fr] lg:py-24`}>
      <div>
        <h1 className="max-w-[14ch] text-[clamp(2.25rem,5vw,var(--fs-marketing-display))] font-semibold leading-[1.05] tracking-[-0.03em] text-fg">
          Ask about a place.
        </h1>
        <p className="mt-6 max-w-[46ch] text-m-lead leading-[1.65] text-fg-2">
          Tell us the year group and the exam board, and we will come back with
          the timetable, the papers covered and the fee.
        </p>

        <div className="mt-12 flex flex-col gap-4 border-t border-[var(--border-light)] pt-8">
          <a
            href={CONTACT.whatsappUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 text-m-body text-fg-2 transition-colors duration-[var(--dur-fast)] hover:text-fg"
          >
            <WhatsappLogoIcon size={20} className="text-fg-3" />
            WhatsApp
          </a>
          <a
            href={`mailto:${CONTACT.email}`}
            className="inline-flex items-center gap-3 text-m-body text-fg-2 transition-colors duration-[var(--dur-fast)] hover:text-fg"
          >
            <EnvelopeSimpleIcon size={20} className="text-fg-3" />
            {CONTACT.email}
          </a>
        </div>
      </div>

      <ContactForm />
    </section>
  );
}
