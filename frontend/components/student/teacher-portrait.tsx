'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cx, Avatar } from '@/components/ui';

/**
 * Dr. Tahir's illustrated portrait - the single image at the centre of the
 * student's Home screen, matching the reference layout the client supplied.
 *
 * `next/image` rather than the plain `<img>` the blog gallery uses: that
 * exemption exists because blog media is author-supplied and can point at any
 * host, which cannot be enumerated in `images.remotePatterns`. This is a fixed
 * local file under `public/`, so the optimiser applies and there is no reason
 * to opt out of it.
 *
 * **The fallback is the point.** The asset is supplied by the client rather
 * than generated, so it can legitimately be missing from a fresh checkout. A
 * broken-image glyph in the hero of the first screen a student sees is far
 * worse than initials, so a failed load swaps to the same `Avatar` the rest of
 * the product uses and the screen still reads as finished.
 */
export function TeacherPortrait({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={cx('flex items-center justify-center', className)}>
        <Avatar name={name} className="h-[112px] w-[112px] text-[var(--fs-lg)]" />
      </span>
    );
  }

  return (
    <Image
      src="/teacher-portrait.png"
      alt={name}
      width={160}
      height={160}
      priority
      onError={() => setFailed(true)}
      className={cx('h-[160px] w-[160px] shrink-0 object-contain', className)}
    />
  );
}
