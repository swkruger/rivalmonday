import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { getViewer } from '@/server/current-viewer';
import { themeForViewer } from '@/server/theme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = { title: 'Rival Monday', robots: { index: false, follow: false } };

/** Review Focus 5: `style` only ever carries the validated hex colours `themeVars` returns — never raw agency input. */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { style } = await themeForViewer(await getViewer());
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
