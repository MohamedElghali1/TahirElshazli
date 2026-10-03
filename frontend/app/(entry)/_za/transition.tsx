'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, type Variants } from 'motion/react';
import { Dot } from './icons';

const WORDS = ['Hello', 'أهلاً', 'Bonjour', 'Ciao', 'Olà', 'やあ', 'Hallå', 'Guten tag', 'Hallo'];

/**
 * The reference's 2s greeting preloader, shown on every entry page. Keyed on
 * the path because this sits in the shared layout, and each page's entrance
 * animation is timed to start as the preloader leaves.
 */
export function Transition({ children }: { children: React.ReactNode }) {
  return <Page key={usePathname()}>{children}</Page>;
}

function Page({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(false);
      window.scrollTo(0, 0);
    }, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="overflow-hidden">
      <AnimatePresence mode="wait">{loading ? <Preloader /> : null}</AnimatePresence>
      {children}
    </div>
  );
}

const slideUp: Variants = {
  initial: { top: 0 },
  exit: { top: '-100vh', transition: { duration: 0.8, ease: [0.76, 0, 0.24, 1], delay: 0.2 } },
};

const fade: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 0.75, transition: { duration: 1, delay: 0.2 } },
};

const noSubscribe = () => () => {};

function Preloader() {
  const [index, setIndex] = useState(0);
  // Measured once, client only; 0 on the server so hydration matches.
  const width = useSyncExternalStore(noSubscribe, () => window.innerWidth, () => 0);
  const height = useSyncExternalStore(noSubscribe, () => window.innerHeight, () => 0);
  useEffect(() => {
    if (index >= WORDS.length - 1) return;
    const t = setTimeout(() => setIndex((i) => i + 1), index === 0 ? 500 : 250);
    return () => clearTimeout(t);
  }, [index]);

  const initialPath = `M0 0 L${width} 0 L${width} ${height} Q${width / 2} ${height + 300} 0 ${height}  L0 0`;
  const targetPath = `M0 0 L${width} 0 L${width} ${height} Q${width / 2} ${height} 0 ${height}  L0 0`;
  const curve: Variants = {
    initial: { d: initialPath, transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1] } },
    exit: { d: targetPath, transition: { duration: 0.7, ease: [0.76, 0, 0.24, 1], delay: 0.3 } },
  };

  return (
    <motion.div
      className="fixed z-50 flex h-screen w-screen cursor-wait items-center justify-center bg-za-foreground"
      variants={slideUp}
      initial="initial"
      exit="exit"
      aria-hidden
    >
      {width > 0 ? (
        <>
          <motion.div
            className="flex items-center justify-center text-3xl text-za-background md:text-4xl"
            variants={fade}
            initial="initial"
            animate="enter"
          >
            <Dot size={48} className="me-3" />
            <p>{WORDS[index]}</p>
          </motion.div>
          <motion.svg className="absolute top-0 -z-10 h-[calc(100%+300px)] w-full">
            <motion.path className="fill-za-foreground" variants={curve} initial="initial" exit="exit" />
          </motion.svg>
        </>
      ) : null}
    </motion.div>
  );
}
