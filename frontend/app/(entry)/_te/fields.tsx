'use client';

import { useId, useState } from 'react';

export function GoogleMark() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function AlertGlyph() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 4.8v3.6M8 11h.01" />
    </svg>
  );
}

export function FormAlert({ children }: { children: React.ReactNode }) {
  return (
    <div role="alert" className="alert">
      <AlertGlyph />
      <span>{children}</span>
    </div>
  );
}

type FieldProps = {
  label: string;
  name: string;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  placeholder?: string;
  autoFocus?: boolean;
  error?: string;
  delay?: number;
  onValue?: (value: string) => void;
  /** Rendered under a password field: the strength meter and its help line. */
  below?: React.ReactNode;
  /** Rendered on the label row, right-aligned ("Forgot password?"). */
  aside?: React.ReactNode;
};

/** A labelled field; a `password` type gets the show/hide eye. */
export function Field({
  label,
  name,
  type = 'text',
  autoComplete,
  placeholder,
  autoFocus,
  error,
  delay,
  onValue,
  below,
  aside,
}: FieldProps) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className={`fgroup${delay === undefined ? '' : ' bi'}`} style={delay === undefined ? undefined : { animationDelay: `${delay}ms` }}>
      {aside ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <label className="lbl" htmlFor={id}>{label}</label>
          {aside}
        </div>
      ) : (
        <label className="lbl" htmlFor={id}>{label}</label>
      )}
      <div className={`fld${error ? ' err' : ''}`}>
        <input
          id={id}
          name={name}
          type={isPassword && shown ? 'text' : type}
          autoComplete={autoComplete}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-err` : undefined}
          onChange={onValue ? (e) => onValue(e.target.value) : undefined}
        />
        {isPassword ? (
          <button type="button" className="eye" aria-label={shown ? 'Hide password' : 'Show password'} onClick={() => setShown((s) => !s)}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
              <circle cx="12" cy="12" r="3" />
              {shown ? <path d="M4 4l16 16" /> : null}
            </svg>
          </button>
        ) : null}
      </div>
      {error ? (
        <span id={`${id}-err`} className="ferr"><AlertGlyph />{error}</span>
      ) : null}
      {below}
    </div>
  );
}

/** Primary submit button; keeps its size while busy and ignores further clicks. */
export function SubmitButton({ busy, idle, working, delay }: { busy: boolean; idle: string; working: string; delay?: number }) {
  return (
    <button
      type="submit"
      className={`btn btn-p btn-block${delay === undefined ? '' : ' bi'}`}
      style={{ marginTop: 4, ...(delay === undefined ? {} : { animationDelay: `${delay}ms` }) }}
      disabled={busy}
      aria-busy={busy}
    >
      {busy ? (
        <>
          <span className="spin" aria-hidden="true" />
          {working}
        </>
      ) : (
        idle
      )}
    </button>
  );
}

/** 0-4, the design's rule: length+digit, then mixed case, then a symbol or 12+ characters. */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 1;
  if (pw.length >= 8 && /\d/.test(pw)) score = 2;
  if (score === 2 && /[a-z]/.test(pw) && /[A-Z]/.test(pw)) score = 3;
  if (score === 3 && (/[^A-Za-z0-9]/.test(pw) || pw.length >= 12)) score = 4;
  return score;
}

export function StrengthMeter({ password }: { password: string }) {
  const score = passwordScore(password);
  const label = ['', 'Weak', 'Fair', 'Good', 'Strong'][score];
  return (
    <>
      <div className="meter" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`mseg${i < score ? (score === 4 ? ' g' : ' m') : ''}`} />
        ))}
      </div>
      <div className="pwhelp">
        <span>At least 8 characters, one letter and one number</span>
        <b aria-live="polite" style={score === 4 ? { color: '#188038' } : undefined}>{label}</b>
      </div>
    </>
  );
}
