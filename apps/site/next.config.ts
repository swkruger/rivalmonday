import type { NextConfig } from 'next';
import { siteEnv } from './src/lib/env';
import { securityHeaders } from './src/lib/headers';

// No `.env` loading: the site reads only public env (NEXT_PUBLIC_*, VERCEL_ENV) set by the host or shell.
// No `output: 'export'`: security headers need the Next runtime; pages still prerender.
const config: NextConfig = {
  // Workspace packages ship TypeScript source (@cs/ui reaches @cs/core and @cs/email/branding).
  transpilePackages: ['@cs/ui', '@cs/core', '@cs/email'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    // Vercel Analytics is same-origin `/_vercel/insights/*`, covered by 'self'.
    return [{ source: '/:path*', headers: securityHeaders(siteEnv.appUrl, process.env.NODE_ENV === 'development') }];
  },
};

export default config;
