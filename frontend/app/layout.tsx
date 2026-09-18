import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/session';

// Inter is the design system's own face — the family the Figma source names and
// the type scale in app/tokens/semantic.css was measured against, not a
// substitution. The handoff loads it from the Google Fonts CDN via an @import;
// `next/font` self-hosts the same family instead, which removes the request to
// Google from the visitor's browser and the layout shift that comes with it.
// The variable name is what semantic.css's --font-sans reads.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

// Numerals only. A distinct mono face is what makes a column of marks scan as
// data rather than prose, and the system leans on it hard: every score, every
// n/m, every duration and every countdown is tabular.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL('https://tahirelshazli.com'),
  title: {
    default: 'Dr. Tahir Elshazli - IGCSE and IELTS preparation',
    template: '%s | Dr. Tahir Elshazli',
  },
  description:
    'Structured IGCSE and IELTS preparation with Dr. Tahir Elshazli. Live classes, recorded lessons, marked assignments and a full progress record for every student.',
  openGraph: {
    type: 'website',
    siteName: 'Dr. Tahir Elshazli',
    title: 'Dr. Tahir Elshazli - IGCSE and IELTS preparation',
    description:
      'Live classes, recorded lessons, marked assignments and a full progress record for every student.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // Duplicates --surface from app/tokens/semantic.css, because a <meta> tag
  // cannot read a CSS variable. Nothing enforces the coupling, so changing the
  // surface colours there means changing these two by hand or the browser
  // chrome stops matching the page. Values are `--grays-gray-1` in each theme.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

/**
 * Applies the stored theme before first paint. Without this a reader who has
 * chosen dark gets one light frame and then a flip, which reads as a bug.
 *
 * Note the posture the design system ships with, because it is a change:
 * **light is the default and dark is an explicit opt-in.** `fig-tokens.css`
 * defines dark only under `:root[data-theme="dark"]` and carries no
 * `prefers-color-scheme` block at all, so an unset preference resolves light
 * even on a device set to dark. That is the handoff's decision, not an
 * oversight on this side; following the OS would mean writing a fallback the
 * design does not specify. See docs/redesign-mapping.md, open question 7.
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('te.theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={`${inter.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-accent focus:px-4 focus:py-2 focus:text-fg-invert"
        >
          Skip to content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
