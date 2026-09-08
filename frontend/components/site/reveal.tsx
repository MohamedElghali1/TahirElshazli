'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { motion } from 'motion/react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * `prefers-reduced-motion`, read in a way that survives hydration.
 *
 * `window.matchMedia` does not exist on the server, so any hook that reads it
 * directly resolves one way while rendering on the server and another on the
 * client's first pass. React reports that as a hydration mismatch, which is
 * what this component used to throw.
 *
 * `useSyncExternalStore` is the supported way out rather than a `mounted` flag
 * set from an effect: React uses `getServerSnapshot` for the hydrating render
 * and only switches to the live value once hydration is done, so the two
 * passes agree by construction. The effect-flag version also tripped
 * `react-hooks/set-state-in-effect`.
 */
function usePrefersReducedMotion(): boolean {
  const subscribe = useCallback((onStoreChange: () => void) => {
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    query.addEventListener('change', onStoreChange);
    return () => query.removeEventListener('change', onStoreChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

/**
 * Entry motion for marketing sections. It exists to sequence a reader down the
 * page, not for decoration, so it fires once and never loops.
 *
 * Reduced motion is honoured by collapsing the **transition**, not by changing
 * `initial`. That distinction is load-bearing: `initial` is read only on a
 * motion component's first render, so switching it to `false` after hydration
 * would leave a visitor who asked for reduced motion watching the full
 * transition anyway. Collapsing the duration to zero makes the content appear
 * in place the moment it scrolls into view, which is what was asked for.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = usePrefersReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={
        reduce
          ? { duration: 0 }
          : { duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }
      }
    >
      {children}
    </motion.div>
  );
}
