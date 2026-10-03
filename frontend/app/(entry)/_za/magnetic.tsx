'use client';

import { useRef, useState } from 'react';
import { motion } from 'motion/react';

/**
 * The reference's MagneticButton (`magneticVariance`): follows the pointer,
 * scales on hover, and floods with the hover colour from below. A span, not a
 * button, because every use sits inside a link; focus is the link's (the
 * global `:focus-visible` outline).
 */
const BASE =
  "relative inline-flex items-center justify-center overflow-hidden rounded-full font-medium transition-colors before:absolute before:left-[-10%] before:top-[-10%] before:h-0 before:w-[120%] before:translate-y-3/4 before:scale-0 before:rounded-full before:pb-[120%] before:content-[''] after:absolute after:inset-0 after:h-full after:w-full after:-translate-y-full after:rounded-full after:transition-transform after:duration-300 after:ease-in-expo after:content-[''] hover:before:translate-y-0 hover:before:scale-100 hover:before:transition-transform hover:before:duration-300 hover:before:ease-in-expo hover:after:translate-y-0 hover:after:transition-transform hover:after:delay-300 hover:after:duration-75 hover:after:ease-linear";

const VARIANT = {
  default: 'bg-transparent before:bg-transparent after:bg-transparent',
  primary: 'bg-za-primary text-za-background before:bg-za-primary-foreground after:bg-za-primary-foreground',
  ghost: 'bg-za-foreground text-za-background before:bg-za-primary after:bg-za-primary',
  outline: 'border border-solid before:bg-za-primary after:bg-za-primary',
} as const;

const SIZE = {
  default: 'p-2 text-za-sm',
  md: 'px-8 py-10 text-za-base',
  lg: 'px-8 py-16 text-za-lg lg:px-12 lg:py-20',
} as const;

export function Magnetic({
  children,
  variant = 'default',
  size = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: keyof typeof VARIANT;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  return (
    <motion.span
      ref={ref}
      className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      animate={pos}
      transition={{ type: 'spring', damping: 15, stiffness: 150, mass: 0.1 }}
      onPointerMove={(e) => {
        const r = ref.current!.getBoundingClientRect();
        setPos({ x: (e.clientX - (r.left + r.width / 2)) * 0.35, y: (e.clientY - (r.top + r.height / 2)) * 0.35 });
      }}
      onPointerOut={() => setPos({ x: 0, y: 0 })}
      whileHover={{ scale: 1.1 }}
    >
      <span className="relative z-[1] block w-max max-w-[14ch] break-all">{children}</span>
    </motion.span>
  );
}
