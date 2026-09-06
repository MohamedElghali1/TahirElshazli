import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
};

export default nextConfig;
