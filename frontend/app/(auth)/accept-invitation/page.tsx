'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { useSession } from '@/lib/session';
import { resolvePostAuthPath } from '@/lib/roles';
import { Button, TextInput, InlineBanner } from '@/components/ui';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

/** Sets a password for an assistant invitation and signs them straight in (`AUTH-4`). */
export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={null}>
      <AcceptInvitationForm />
    </Suspense>
  );
}

function AcceptInvitationForm() {
  const token = useSearchParams().get('token');
  const { acceptInvitation } = useSession();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token) {
    return (
      <>
        <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-fg">
          That link is incomplete
        </h1>
        <p className="mt-[var(--sp-4)] text-[var(--fs-body)] leading-[var(--lh-loose)] text-fg-2">
          Ask whoever invited you to resend the invitation, and use the link
          straight away.
        </p>
        <Link
          href="/login"
          className="mt-[var(--sp-8)] inline-block text-[var(--fs-base)] text-fg-2 underline underline-offset-4 hover:text-fg"
        >
          Back to sign in
        </Link>
      </>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password') ?? '');

    if (!PASSWORD_RULE.test(password)) {
      setFieldError('At least 8 characters, including one letter and one number.');
      return;
    }
    setFieldError(null);
    setError(null);
    setBusy(true);
    try {
      const account = await acceptInvitation(token!, password);
      router.push(resolvePostAuthPath(account.role, null));
    } catch (cause) {
      setError(
        cause instanceof ApiError
          ? cause.message
          : 'Could not accept this invitation. Please try again.',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <h1 className="text-[var(--fs-h2)] font-semibold tracking-[-0.02em] text-fg">
        Set your password
      </h1>
      <p className="mt-[var(--sp-2)] text-[var(--fs-body)] text-fg-3">
        Choose a password to activate your account.
      </p>

      <form onSubmit={submit} noValidate className="mt-[var(--sp-8)] flex flex-col gap-[var(--sp-6)]">
        <TextInput
          label="Password"
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus
          hint="At least 8 characters, including one letter and one number."
          error={fieldError}
          aria-invalid={Boolean(fieldError)}
        />

        {error && <InlineBanner tone="danger">{error}</InlineBanner>}

        <Button type="submit" variant="primary" size="medium" disabled={busy}>
          {busy ? 'Activating…' : 'Activate account'}
        </Button>
      </form>
    </>
  );
}
