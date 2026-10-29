import type { NextConfig } from 'next';

// No `.env` loading: the site reads only public env (NEXT_PUBLIC_*, VERCEL_ENV) set by the host or shell.
// No `output: 'export'`: security headers need the Next runtime; pages still prerender.
const config: NextConfig = {
  // Workspace packages ship TypeScript source (@cs/ui reaches @cs/core and @cs/email/branding).
  transpilePackages: ['@cs/ui', '@cs/core', '@cs/email'],
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
