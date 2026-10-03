/**
 * The six lucide glyphs the reference uses, inlined (lucide is ISC) rather
 * than adding `lucide-react` for six paths.
 */
type IconProps = { size?: number; strokeWidth?: number; className?: string };

function Svg({ size = 24, strokeWidth = 2, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const FlaskConical = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
    <path d="M8.5 2h7" />
    <path d="M7 16h10" />
  </Svg>
);

export const ArrowRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </Svg>
);

export const ArrowLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Svg>
);

export const MoveDownRight = (p: IconProps) => (
  <Svg {...p}>
    <path d="M19 13V19H13" />
    <path d="M5 5L19 19" />
  </Svg>
);

export const Dot = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12.1" cy="12.1" r="1" />
  </Svg>
);

export const ArrowDownLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="M17 7 7 17" />
    <path d="M17 17H7V7" />
  </Svg>
);
