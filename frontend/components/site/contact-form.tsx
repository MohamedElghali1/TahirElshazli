'use client';

import { useState } from 'react';
import { Button, Field, FormError, Input, Select, Textarea } from '@/components/ui';

type Status = 'idle' | 'sending' | 'sent' | 'failed';

interface Errors {
  name?: string;
  email?: string;
  message?: string;
}

/**
 * The enquiry form.
 *
 * There is no contact endpoint yet - CLAUDE.md §7.1 records that no public API
 * exists beyond the health check, so this validates and shows the submitted
 * state without posting anywhere. Wiring it is a one-line change to `submit`
 * once `POST /contact` lands, and it must arrive with CAPTCHA and rate
 * limiting per §8 before it goes live.
 */
export function ContactForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [errors, setErrors] = useState<Errors>({});

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();

    const next: Errors = {};
    if (name.length < 2) next.name = 'Please enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = 'Please enter an email address we can reply to.';
    if (message.length < 10)
      next.message = 'A sentence or two about what you need is enough.';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus('sending');
    // TODO: POST /contact once the public API exists (CLAUDE.md §7.1).
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div
        role="status"
        className="flex flex-col items-start justify-center rounded-[var(--r-lg)] border border-[var(--accent-line)] bg-[var(--accent-wash)] p-[var(--sp-12)]"
      >
        <h2 className="text-[var(--fs-h3)] font-semibold text-[var(--fg-primary)]">
          Thank you, that is with us.
        </h2>
        <p className="mt-[var(--sp-3)] max-w-[44ch] text-[var(--fs-body)] leading-[var(--lh-loose)] text-[var(--fg-secondary)]">
          We reply within one working day. If it is urgent, WhatsApp is faster.
        </p>
        <Button
          className="mt-[var(--sp-6)]"
          size="lg"
          onClick={() => setStatus('idle')}
        >
          Send another
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-[var(--sp-6)] rounded-[var(--r-lg)] border border-[var(--border-medium)] bg-[var(--bg-secondary)] p-[var(--sp-8)]"
    >
      <div className="grid gap-[var(--sp-6)] sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={errors.name}>
          <Input
            uiSize="lg"
            id="name"
            name="name"
            autoComplete="name"
            aria-invalid={Boolean(errors.name)}
          />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email}>
          <Input
            uiSize="lg"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>
      </div>

      <div className="grid gap-[var(--sp-6)] sm:grid-cols-2">
        <Field label="Course of interest" htmlFor="track">
          <Select id="track" name="track" defaultValue="igcse" uiSize="lg">
            <option value="igcse">IGCSE English</option>
            <option value="ielts">IELTS Preparation</option>
            <option value="unsure">Not sure yet</option>
          </Select>
        </Field>
        <Field
          label="Year group or target band"
          htmlFor="level"
          hint="Optional"
        >
          <Input id="level" name="level" placeholder="Year 11, or band 7" uiSize="lg" />
        </Field>
      </div>

      <Field
        label="What would you like to know?"
        htmlFor="message"
        error={errors.message}
      >
        <Textarea
            uiSize="lg"
          id="message"
          name="message"
          rows={5}
          aria-invalid={Boolean(errors.message)}
        />
      </Field>

      {status === 'failed' && (
        <FormError>
          That did not send. Please try again, or message us on WhatsApp.
        </FormError>
      )}

      <div className="flex items-center justify-between gap-[var(--sp-4)]">
        <p className="text-[var(--fs-xs)] text-[var(--fg-tertiary)]">
          We use your details to reply to this enquiry and nothing else.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={status === 'sending'}
          className="shrink-0"
        >
          Send enquiry
        </Button>
      </div>
    </form>
  );
}
