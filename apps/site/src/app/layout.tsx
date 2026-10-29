import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './site.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['400', '500', '600', '800'], display: 'swap' });

export const metadata: Metadata = { title: 'Rival Monday' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-surface text-ink font-sans">{children}</body>
    </html>
  );
}
