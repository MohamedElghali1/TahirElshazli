import type { Metadata, Viewport } from 'next';
import { Inter, Geist_Mono } from 'next/font/google';
import './globals.css';
import { SessionProvider } from '@/lib/session';

// Inter is the reference design system's own face (font.family is
// 'Inter, sans-serif'), so it is not a substitution - it is the font the
// type scale in app/tokens.css was measured against.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

// Kept for numerals only. Inter's tabular figures are fine, but a distinct
// mono face is what makes a column of marks scan as data rather than prose.
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
  // Duplicates --bg-primary from app/tokens.css, because a <meta> tag cannot
  // read a CSS variable. Nothing enforces the coupling, so changing the surface
  // colours there means changing these two by hand or the browser chrome stops
  // matching the page.
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#171717' },
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
  ],
};

/**
 * Applies the stored theme before first paint. Without this the page renders
 * in the system theme for one frame and then flips, which reads as a bug.
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
          className="sr-only focus:not-sr-only focus:absolute focus:start-[var(--sp-4)] focus:top-[var(--sp-4)] focus:z-50 focus:rounded-[var(--r-md)] focus:bg-[var(--accent)] focus:px-[var(--sp-4)] focus:py-[var(--sp-2)] focus:text-accent-fg"
        >
          Skip to content
        </a>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
