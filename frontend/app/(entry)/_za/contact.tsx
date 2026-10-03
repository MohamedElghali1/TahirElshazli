'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { motion, useScroll, useTransform } from 'motion/react';
import { ArrowDownLeft } from './icons';
import { Magnetic } from './magnetic';

/**
 * The reference's closing "Let's learn chemistry" footer (`_layout/contact`),
 * with its scroll-linked drift. Its four social links (bare youtube.com,
 * instagram.com...), its email address and its "next intake" date were
 * placeholders in the reference and are left out until the client supplies
 * real ones; every link that remains goes to a working route.
 */
export function Contact() {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const x = useTransform(scrollYProgress, [0, 1], [-50, 50]);
  const y = useTransform(scrollYProgress, [0, 1], [-50, 50]);

  const title = 'text-[length:calc(clamp(3.25em,7vw,8em)*0.875)] leading-[1.1]';

  return (
    <motion.footer ref={ref} className="relative max-h-screen bg-za-foreground text-za-background" style={{ y }}>
      <div className="py-[clamp(5em,21vh,12em)]">
        <div className="mx-auto px-[calc(clamp(2.5em,8vw,8em)*2)] min-[1400px]:max-w-[1400px]">
          <div className="pb-[calc(clamp(5em,21vh,12em)/2)]">
            <div className="flex items-center gap-8">
              <div className="relative size-[clamp(4.5em,6.5vw,8em)] shrink-0">
                <Image
                  src="/za3balawy-hero.jpg"
                  className="rounded-full object-cover"
                  fill
                  sizes="200px"
                  alt="Dr. Za3balawy"
                />
              </div>
              <h2 className={title}>Let’s learn</h2>
            </div>
            <div className="flex items-center justify-between">
              <h2 className={title}>chemistry</h2>
              <ArrowDownLeft size={28} strokeWidth={1.25} />
            </div>
          </div>

          <div className="pb-[calc(clamp(5em,21vh,12em)/2)]">
            <div className="relative w-full">
              <div className="h-px bg-za-muted-foreground" />
              <div className="absolute right-0 top-0 z-20 -translate-x-1/2 -translate-y-1/2">
                <motion.div style={{ x }}>
                  <Link href="/register">
                    <Magnetic variant="primary" size="lg">
                      Join the class
                    </Magnetic>
                  </Link>
                </motion.div>
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-4 lg:flex-row">
            <Link href="/login">
              <Magnetic variant="outline" size="md" className="w-full border-za-muted-foreground">
                Already a student? Sign in
              </Magnetic>
            </Link>
          </div>
        </div>

        <div className="px-12 pb-4 pt-10">
          <h3 className="mb-4 text-za-xs uppercase text-za-muted-foreground">Curriculum</h3>
          <p className="mt-7">IGCSE Chemistry</p>
        </div>
      </div>
    </motion.footer>
  );
}
