'use client';

import { useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
  type Variants,
} from 'motion/react';
import { Dot, FlaskConical, MoveDownRight } from './icons';
import { Magnetic } from './magnetic';

const NAV = [
  { href: '/about', title: 'about' },
  { href: '/register', title: 'sign up' },
  { href: '/login', title: 'sign in' },
];

export function Navbar() {
  return (
    <nav className="absolute inset-x-0 top-0 z-10">
      <div className="flex items-center justify-between gap-2 px-4 py-4 text-za-background sm:gap-4 sm:px-5 lg:px-8">
        <Link href="/" className="group flex items-center pb-5" aria-label="Dr. Za3balawy, home">
          <span className="shrink-0 transition-transform duration-500 ease-in-expo group-hover:rotate-[360deg]">
            <FlaskConical size={20} className="sm:size-6" />
          </span>
          <span className="relative ms-2 h-6 overflow-hidden whitespace-nowrap">
            <span className="block text-za-sm leading-6 transition-transform duration-500 ease-in-expo group-hover:-translate-y-full sm:text-za-base">
              Dr. Za3balawy
            </span>
            <span className="absolute left-0 top-full block text-za-sm leading-6 transition-transform duration-500 ease-in-expo group-hover:-translate-y-full sm:text-za-base">
              Chemistry Class
            </span>
          </span>
        </Link>

        <ul className="-me-2 flex items-center lg:me-0">
          {NAV.map(({ href, title }) => (
            <li key={href} className="group px-1.5 py-4 sm:px-2 lg:px-4">
              <Link href={href}>
                <Magnetic>
                  <span className="whitespace-nowrap text-za-xs capitalize sm:text-za-sm lg:text-za-base">{title}</span>
                  <span className="flex items-center justify-center">
                    <Dot className="scale-0 transition-transform duration-200 ease-in-expo group-hover:scale-100" />
                  </span>
                </Magnetic>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

const headerSlideUp: Variants = {
  initial: { y: 300 },
  enter: { y: 0, transition: { duration: 0.6, ease: [0.33, 1, 0.68, 1], delay: 2.5 } },
};

export function Header() {
  return (
    <motion.header
      className="relative h-screen overflow-hidden bg-za-foreground text-za-background"
      variants={headerSlideUp}
      initial="initial"
      animate="enter"
    >
      <Image
        src="/za3balawy-hero.jpg"
        className="object-cover object-top md:scale-110 md:object-center"
        fill
        sizes="100vw"
        priority
        alt="Mohamed Za3balawy, chemistry teacher, holding a conical flask"
      />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-t from-za-foreground via-za-foreground/75 to-transparent" />

      <div className="relative flex h-full flex-col justify-end gap-2 md:flex-col-reverse md:justify-normal">
        <div className="select-none">
          <h1 className="text-[length:max(9em,15vw)]">
            <ParallaxSlider repeat={4} baseVelocity={2}>
              <span className="pe-12">
                Dr. Za3balawy
                <span>—</span>
              </span>
            </ParallaxSlider>
          </h1>
        </div>

        <div className="md:ml-auto">
          <div className="mx-10 max-md:my-12 md:mx-36">
            <div className="mb-4 md:mb-20">
              <MoveDownRight size={28} strokeWidth={1.25} />
            </div>
            <p className="text-[length:clamp(1.55em,2.5vw,2.75em)]">
              <span className="block">Chemistry Teacher</span>
              <span className="block">IGCSE &amp; Beyond</span>
            </p>
          </div>
        </div>
      </div>
    </motion.header>
  );
}

/** Scroll-velocity marquee, as in the reference's `useParallaxSlider`. */
function ParallaxSlider({
  children,
  repeat,
  baseVelocity,
}: {
  children: React.ReactNode;
  repeat: number;
  baseVelocity: number;
}) {
  const baseX = useMotionValue(0);
  const { scrollY } = useScroll();
  const smoothVelocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 5], { clamp: false });
  // The -20..-45% wrap is 100% / 4 copies, as in the reference.
  const x = useTransform(baseX, (v) => `${wrap(-20, -45, v)}%`);
  const direction = useRef(1);

  useAnimationFrame((_, delta) => {
    let moveBy = direction.current * baseVelocity * (delta / 1000);
    if (velocityFactor.get() < 0) direction.current = -1;
    else if (velocityFactor.get() > 0) direction.current = 1;
    moveBy += direction.current * moveBy * velocityFactor.get();
    baseX.set(baseX.get() + moveBy);
  });

  return (
    <div className="flex flex-nowrap overflow-hidden whitespace-nowrap">
      <motion.div style={{ x }}>
        {Array.from({ length: repeat }, (_, i) => (
          <span key={i}>{children}</span>
        ))}
      </motion.div>
    </div>
  );
}
