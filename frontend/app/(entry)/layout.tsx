import { Suspense } from 'react';
import { Caveat, Inter_Tight } from 'next/font/google';
import './entry.css';

/**
 * Home, About, sign in and sign up - the "Tahir Elshazli - Teacher Website"
 * Claude Design handoff. Its palette and motion live in entry.css, scoped to
 * `.te`; Inter Tight is the body face and Caveat the handwritten accent.
 */
const interTight = Inter_Tight({
  variable: '--font-inter-tight',
  subsets: ['latin'],
  display: 'swap',
});
const caveat = Caveat({
  variable: '--font-caveat',
  subsets: ['latin'],
  weight: ['500', '700'],
  display: 'swap',
});

export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`te ${interTight.variable} ${caveat.variable} min-h-[100dvh]`}>
      {/* Sign in and sign up read `?next=` with `useSearchParams`. */}
      <Suspense fallback={null}>{children}</Suspense>
    </div>
  );
}
