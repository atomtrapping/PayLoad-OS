import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Type errors block the build. Same policy as Payload Terminal V0.
  typescript: { ignoreBuildErrors: false },
  // Local runtime stores, host-specific Rust builds, and the repository's own
  // documentation and test output are never deployment assets. Without the
  // documentation exclusions the /earth trace carried 15.4 MB of docs and
  // screenshots that no page reads at runtime.
  outputFileTracingExcludes: {
    '/*': [
      './.payload/**/*', './.stamp/**/*', './.git/**/*', './.env*',
      './tools/**/*', './artifacts/**/*',
      './Dockerfile', './.dockerignore', './deploy/**/*', './scripts/deployment*',
      './scripts/access-smoke*', './src/db/fixtures/**/*',
      './native/state-kernel/target/**/*', './next.config.ts',
      './docs/**/*', './test-results/**/*', './playwright-report/**/*', './README.md',
      // Test and tooling source rode in all 17 route traces: 189 non-runtime files,
      // 2.3 MB each. Under output: 'standalone' those files are copied, not just
      // listed. scripts/ and examples/ are deliberately NOT excluded: src/gat/runtime.ts
      // spawns scripts/gat-audit-runner.py, and src/adapter/productionSource.ts reads
      // examples/ during the /candidates render.
      // Keep this aligned with the audit's test-source extensions. Node's .test.mjs
      // packaging checks must not ride in routes that inspect local file trees.
      './**/*.{test,spec}.{js,jsx,ts,tsx,mjs,mjsx,cjs,cjsx,mts,mtsx,cts,ctsx,py}',
      './tests/**/*', './clients/**/*', './tools/terminal_lake/**/*', './tsconfig.tsbuildinfo', './package-lock.json',
    ],
  },
  // The /candidates server render reads these committed bytes and recomputes their
  // digests. Tracing does not reach them through the dynamic import, so a standalone
  // build shipped without them and the page failed. .stamp/production-worker.mjs stays
  // excluded on purpose: src/production/worker.ts spawns it, but it is operator-built.
  outputFileTracingIncludes: {
    '/candidates': [
      './examples/carrier/acquisition.json', './examples/carrier/source.json',
      './examples/carrier/normalization.json', './examples/evidence/request.json',
      './examples/evidence/notice.txt',
    ],
  },
  // `/product` and `/products` read as one route pair while meaning different
  // things: the operating model, and the products themselves. The model moved to
  // `/model`. A permanent HTTP redirect keeps every existing link and bookmark
  // working without rendering an intermediate page.
  async redirects() {
    return [{ source: '/product', destination: '/model', permanent: true }];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
