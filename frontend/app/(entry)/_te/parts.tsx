import Image from 'next/image';
import Link from 'next/link';

/** The two margin-note doodles ("Aa noun · verb" and "A+ Well done!"). */
export function Decos() {
  const grid = 'M0 70 H220 M0 116 H220 M0 162 H220 M0 208 H220 M0 254 H220 M0 300 H220';
  return (
    <>
      <svg aria-hidden="true" className="deco deco-l" viewBox="0 0 220 360" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={grid} stroke="#DCE6F5" strokeWidth="1.5" />
        <path d="M36 30 V340" stroke="#F4C7C3" strokeWidth="1.5" />
        <text x="58" y="156" fontFamily="var(--font-caveat), cursive" fontSize="64" fontWeight="700" fill="#0B57D0">Aa</text>
        <text x="58" y="246" fontFamily="var(--font-caveat), cursive" fontSize="32" fontWeight="500" fill="#444746">noun · verb</text>
        <path d="M58 258 C92 252 136 255 176 250" stroke="#1F1F1F" strokeWidth="1.5" />
      </svg>
      <svg aria-hidden="true" className="deco deco-r" viewBox="0 0 220 360" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={grid} stroke="#DCE6F5" strokeWidth="1.5" />
        <text x="34" y="156" fontFamily="var(--font-caveat), cursive" fontSize="64" fontWeight="700" fill="#D93025">A+</text>
        <path d="M36 222 l14 14 l30 -36" stroke="#D93025" strokeWidth="3" />
        <text x="92" y="246" fontFamily="var(--font-caveat), cursive" fontSize="30" fontWeight="500" fill="#444746">Well done!</text>
        <path d="M36 288 c8 -8 16 -8 24 0 s16 8 24 0 s16 -8 24 0" stroke="#0B57D0" strokeWidth="2" />
      </svg>
    </>
  );
}

export const AUTH_UNDERLINE = 'M4 12 C60 6 130 5 190 8 C230 10 262 6 296 9';

/** Text with the animated hand-drawn underline. `scroll` draws it on scroll instead of on load. */
export function Underlined({
  children,
  path = 'M4 13 C50 7 104 5 160 8 C206 10 250 5 296 9',
  scroll = false,
  auth = false,
}: {
  children: React.ReactNode;
  path?: string;
  scroll?: boolean;
  auth?: boolean;
}) {
  return (
    <span className={`uw${auth ? ' uw--auth' : ''}`}>
      {children}
      <svg aria-hidden="true" viewBox="0 0 300 20" preserveAspectRatio="none">
        <path className={`ul${scroll ? ' sv' : ''}`} pathLength={1} d={path} vectorEffect="non-scaling-stroke" />
      </svg>
    </span>
  );
}

export function Wordmark() {
  return (
    <Link className="wm" href="/">
      <Image src="/entry/logo.svg" alt="" width={28} height={28} />
      Tahir Elshazli
    </Link>
  );
}

/** The class photo used on every page, 1672 x 832. */
export function HeroPhoto({ className, priority = false }: { className: string; priority?: boolean }) {
  return (
    <Image
      className={className}
      src="/entry/hero.webp"
      alt="Tahir Elshazli taking a selfie with a group of smiling students"
      width={1672}
      height={832}
      priority={priority}
      sizes="(max-width: 767px) 170vw, 100vw"
    />
  );
}

export function Arrow() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
