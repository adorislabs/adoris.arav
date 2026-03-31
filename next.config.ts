import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compress responses with gzip
  compress: true,

  // Stricter React for catching bugs
  reactStrictMode: true,

  // Cache build outputs for faster rebuilds
  productionBrowserSourceMaps: false,

  // Optimise package imports — tree-shake heavy deps
  experimental: {
    optimizePackageImports: [
      'lucide-react',
      'framer-motion',
      'react-markdown',
      'katex',
      'rehype-katex',
      'remark-math',
    ],
  },

  // HTTP headers for static assets and API caching
  async headers() {
    return [
      {
        source: '/api/books',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=60, stale-while-revalidate=120' },
        ],
      },
      {
        source: '/api/pdfs/pages',
        headers: [
          { key: 'Cache-Control', value: 's-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      {
        source: '/api/pdfs/file/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
