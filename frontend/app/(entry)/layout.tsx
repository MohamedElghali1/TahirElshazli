import { Suspense } from 'react';
import localFont from 'next/font/local';
import { MotionConfig } from 'motion/react';
import { Transition } from './_za/transition';

/**
 * Landing, sign in and sign up, on the Za3 landing-page reference design
 * (github.com/alies1m/Za3-Landing-page). Its palette, font and motion are
 * scoped to `.za-theme` and to this route group; no other page sees them.
 */
const neueMontreal = localFont({
  src: './_za/neue-montreal.woff2',
  weight: '400',
  style: 'normal',
  display: 'swap',
});

export default function EntryLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`za-theme min-h-[100dvh] ${neueMontreal.className}`}>
      <MotionConfig reducedMotion="user">
        <Transition>
          {/* Sign in and sign up read `?next=` with `useSearchParams`. */}
          <Suspense fallback={null}>{children}</Suspense>
        </Transition>
      </MotionConfig>
    </div>
  );
}
