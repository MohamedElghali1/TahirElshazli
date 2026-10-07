import { Caveat, Inter_Tight } from 'next/font/google';
import { Decos, Underlined, Wordmark, AUTH_UNDERLINE } from '@/app/(entry)/_te/parts';
import '@/app/(entry)/entry.css';

/**
 * The 404 / error screens, on the entry pages' design (the `.te` theme the
 * sign-in card uses): wordmark header, the margin doodles, one white card.
 * They render outside the `(entry)` layout, so the faces and stylesheet that
 * layout provides are loaded here too.
 */
const interTight = Inter_Tight({ variable: '--font-inter-tight', subsets: ['latin'], display: 'swap' });
const caveat = Caveat({ variable: '--font-caveat', subsets: ['latin'], weight: ['500', '700'], display: 'swap' });

export function StatusPage({
  code,
  lead,
  word,
  message,
  children,
}: {
  /** The big figure above the heading ("404"); omitted for a generic error. */
  code?: string;
  /** Heading text before the underlined word. */
  lead: string;
  /** The underlined word that ends the heading. */
  word: string;
  message: string;
  /** The actions — `.btn` buttons/links. */
  children: React.ReactNode;
}) {
  return (
    <div className={`te ${interTight.variable} ${caveat.variable} min-h-[100dvh]`}>
      <div className="si">
        <header className="a-head">
          <Wordmark />
        </header>
        <main id="main" className="si-main">
          <Decos />
          <div className="si-card bi" style={{ textAlign: 'center' }}>
            {code && (
              <p
                aria-hidden="true"
                style={{ fontSize: 72, fontWeight: 600, lineHeight: 1, letterSpacing: '-0.04em', color: 'var(--te-blue)', marginBottom: 16 }}
              >
                {code}
              </p>
            )}
            <h1 className="auth-h">
              {lead} <Underlined auth path={AUTH_UNDERLINE}>{word}</Underlined>
            </h1>
            <p className="auth-p" style={{ marginTop: 12 }}>
              {message}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12, marginTop: 28 }}>
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
