import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { getOperatorViewer, getViewer } from '@/server/current-viewer';
import { themeForViewer } from '@/server/theme';
import './globals.css';

// Inter (OFL, `fonts/LICENSE-Inter.txt`) ships in the repo: `next/font/google` fetches at build time and failed CI builds intermittently.
const inter = localFont({
  variable: '--font-inter',
  display: 'swap',
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
});

/** 15a §2.7 / D12: no product name here — `(app)` names the viewer's agency, `(platform)` names the product. */
export const metadata: Metadata = { title: { default: 'Dashboard', template: '%s' }, robots: { index: false, follow: false } };

/**
 * Review Focus 5: `style` only ever carries the validated hex colours `themeVars` returns — never raw agency input.
 * 8b M1: during a support session `<html>` takes the operator's own theme, never the target agency's; `(app)`'s
 * `AppShell` applies the agency's vars itself (g8), so `/platform` never shows a mixed brand.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const { style } = await themeForViewer(viewer?.kind === 'support' ? await getOperatorViewer() : viewer);
  // Spec 5.3: constant-folded away in production builds, so no panel code is bundled there.
  const banner = process.env.NODE_ENV !== 'production' ? await (await import('@/dev-panel/mount')).devBanner() : null;
  return (
    <html lang="en" className={inter.variable} style={style as React.CSSProperties}>
      <body>
        {banner}
        {children}
      </body>
    </html>
  );
}
