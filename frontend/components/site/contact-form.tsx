'use client';

import { useState } from 'react';
import { Button, TextInput, TextArea, Select, InlineBanner } from '@/components/ui';

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
        className="flex flex-col items-start justify-center rounded-md border border-accent bg-[var(--accent-wash)] p-12"
      >
        <h2 className="text-m-lead font-semibold text-fg">
          Thank you, that is with us.
        </h2>
        <p className="mt-3 max-w-[44ch] text-m-body leading-[1.65] text-fg-2">
          We reply within one working day. If it is urgent, WhatsApp is faster.
        </p>
        <Button
          className="mt-6"
          size="medium"
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
      className="flex flex-col gap-6 rounded-md border border-[var(--border-medium)] bg-surface-2 p-8"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <TextInput
          label="Your name"
          id="name"
          name="name"
          autoComplete="name"
          error={errors.name}
          aria-invalid={Boolean(errors.name)}
        />
        <TextInput
          label="Email"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          error={errors.email}
          aria-invalid={Boolean(errors.email)}
        />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Select
          label="Course of interest"
          id="track"
          name="track"
          defaultValue="igcse"
          options={[
            { value: 'igcse', label: 'IGCSE English' },
            { value: 'ielts', label: 'IELTS Preparation' },
            { value: 'unsure', label: 'Not sure yet' },
          ]}
        />
        <TextInput
          label="Year group or target band"
          id="level"
          name="level"
          placeholder="Year 11, or band 7"
          hint="Optional"
        />
      </div>

      <TextArea
        label="What would you like to know?"
        id="message"
        name="message"
        rows={5}
        error={errors.message}
        aria-invalid={Boolean(errors.message)}
      />

      {status === 'failed' && (
        <InlineBanner tone="danger">
          That did not send. Please try again, or message us on WhatsApp.
        </InlineBanner>
      )}

      <div className="flex items-center justify-between gap-4">
        <p className="text-m-body text-fg-3">
          We use your details to reply to this enquiry and nothing else.
        </p>
        <Button
          type="submit"
          variant="primary"
          size="medium"
          disabled={status === 'sending'}
          className="shrink-0"
        >
          {status === 'sending' ? 'Sending…' : 'Send enquiry'}
        </Button>
      </div>
    </form>
  );
}
