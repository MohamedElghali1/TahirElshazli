import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Seeded placeholders for the marketing pages until real photography of
    // Dr. Tahir and the classes is supplied. See lib/site-content.ts.
    remotePatterns: [{ protocol: 'https', hostname: 'picsum.photos' }],
  },
};

export default nextConfig;
