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
  return (
    <html lang="en" className={inter.variable} style={style as React.CSSProperties}>
      <body>{children}</body>
    </html>
  );
}
