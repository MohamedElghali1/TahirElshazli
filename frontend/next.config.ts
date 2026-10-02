import path from 'node:path';
import type { NextConfig } from 'next';

// The CSP's connect-src/img-src/media-src need the API origin. Read at build
// time, same fallback as frontend/lib/api.ts's own API_URL, so the two never
// disagree about where the browser is allowed to talk to.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const isDev = process.env.NODE_ENV !== 'production';

// Every source below was verified by grep against what the app actually
// loads (REM-047) rather than assumed:
//
// - connect-src: 'self' (the frontend's own API routes, none currently exist)
//   + API_URL (frontend/lib/api.ts, every request) + R2 (presigned reads
//   fetched by `fetch()` in components/marking/use-file-bytes.ts).
// - img-src / media-src: 'self' (next/image's own /_next/image proxy,
//   public/teacher-portrait.png) data: (inline SVG icons) blob: (object URLs
//   from use-file-bytes.ts, consumed by <img> in marking/marked-copy.tsx and
//   marking/marking-surface.tsx) + API_URL (mediaSrc() in lib/api.ts) + R2
//   (the same mediaSrc() passthrough once STORAGE_DRIVER=r2) + picsum.photos
//   (next.config.ts images.remotePatterns, lib/site-content.ts placeholders)
//   + https: — course thumbnails (courses/dto/course.dto.ts thumbnailUrl),
//   recording thumbnails (manage/dto/create-recording.dto.ts thumbnailUrl)
//   and recording video files (components/student/recording-player.tsx
//   FilePlayer's <video src>) are all staff-pasted http(s) URLs with no fixed
//   host (D-57: recordings are plain links), so a host allow-list cannot
//   cover them.
// - frame-src: the only hosts recording-player.tsx and
//   app/(app)/manage/announcements/page.tsx ever build an iframe src for.
// - script-src/style-src: Next.js App Router emits inline bootstrap scripts
//   and styles; no nonce middleware exists yet (a known ceiling — add one to
//   drop 'unsafe-inline'). 'unsafe-eval' only in development, where `next
//   dev`'s Fast Refresh needs it.
// - worker-src: pdf.js's worker (components/marking/pdf-page.tsx) is bundled
//   and instantiated via `new Worker(new URL(...))`, which Next serves as a
//   same-origin asset URL.
// - font-src: next/font/google self-hosts Inter and Geist Mono at build time
//   (app/layout.tsx) — no request to Google's font CDN ever leaves the
//   browser, so no external font host is needed.
const connectSrc = ["'self'", API_URL, 'https://*.r2.cloudflarestorage.com'];
const imgMediaSrc = [
  "'self'",
  'data:',
  'blob:',
  API_URL,
  'https://*.r2.cloudflarestorage.com',
  'https://picsum.photos',
  'https:',
];
const frameSrc = ["'self'", 'https://www.youtube-nocookie.com', 'https://player.vimeo.com'];
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])];

const csp = [
  `default-src 'self'`,
  `script-src ${scriptSrc.join(' ')}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src ${imgMediaSrc.join(' ')}`,
  `media-src ${imgMediaSrc.join(' ')}`,
  `connect-src ${connectSrc.join(' ')}`,
  `frame-src ${frameSrc.join(' ')}`,
  `worker-src 'self' blob:`,
  `font-src 'self'`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
].join('; ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Seeded placeholders for the marketing pages until real photography of
    // Dr. Tahir and the classes is supplied. See lib/site-content.ts.
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }],
  },
  // Emits a self-contained `.next/standalone` server with only the node_modules
  // it actually traces, so the runtime image doesn't need a `npm ci` step or
  // the full node_modules tree copied in - see Dockerfile.frontend.
  output: 'standalone',
  // This is an npm workspaces monorepo with one lockfile at the repo root;
  // without this Next's file tracer walks up looking for the workspace root
  // and (correctly) finds it one level above `frontend/`, but pinning it here
  // avoids a build-time warning and keeps the traced output path stable.
  outputFileTracingRoot: path.join(__dirname, '..'),
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
