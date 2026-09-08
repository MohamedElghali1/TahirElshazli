'use client';

import { motion, AnimatePresence, type Variants } from 'motion/react';
import { useSyncExternalStore } from 'react';

/**
 * Reduced-motion detection. Animations are the premium polish — they should
 * never be forced on a reader who has asked for less motion.
 */
const MEDIA = '(prefers-reduced-motion: reduce)';

function subscribeMotion(cb: () => void) {
  const mql = window.matchMedia(MEDIA);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}

function getMotionSnapshot() {
  return window.matchMedia(MEDIA).matches;
}

function getMotionServer() {
  return false; // never reduce on server — the first client paint decides
}

export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeMotion, getMotionSnapshot, getMotionServer);
}

/* --- Shared variants ---------------------------------------------------- */

/** Fade + slide up. Stagger children by passing `staggerChildren` to parent. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1 },
};

/* --- Container for staggered children ----------------------------------- */

export function StaggerList({
  children,
  className,
  delay = 0,
  stagger = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : 'hidden'}
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: stagger, delayChildren: delay },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** A single child inside StaggerList. */
export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      transition={{ duration: 0.35, ease: [0.2, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Page-level entrance. Wraps the content of a page and fades it in once.
 * Does nothing if the user prefers reduced motion.
 */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.2, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

export { motion, AnimatePresence };
