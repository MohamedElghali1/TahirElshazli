import { Figtree, Google_Sans, Lexend } from 'next/font/google';
import { AppGate } from '@/components/shell/app-gate';
import './classroom.css';

/**
 * The signed-in consoles. The faces are Redesign V2's (both dashboard
 * artifacts): Google Sans for content, Figtree for the bars and nav, Lexend
 * for the wordmark. Loaded here rather than in the root layout so the public
 * site never downloads them. The routing guard is `AppGate`.
 */
const googleSans = Google_Sans({ variable: '--font-gsans', subsets: ['latin'], display: 'swap' });
const figtree = Figtree({ variable: '--font-figtree', subsets: ['latin'], weight: ['400', '500', '600', '700'], display: 'swap' });
const lexend = Lexend({ variable: '--font-lexend', subsets: ['latin'], weight: ['300'], display: 'swap' });

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${googleSans.variable} ${figtree.variable} ${lexend.variable}`}>
      <AppGate>{children}</AppGate>
    </div>
  );
}
