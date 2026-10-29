import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { SITE_NAME, SITE_URL, TITLE_STEM } from '../../content/site';
import { siteEnv } from '../lib/env';
import { JoinProvider } from '../components/join/join-provider';
import { AnnouncementBar } from '../components/shell/announcement-bar';
import { PilotProvider } from '../components/shell/pilot-context';
import { SiteAnalytics } from '../components/shell/site-analytics';
import { SiteFooter } from '../components/shell/site-footer';
import { SiteHeader } from '../components/shell/site-header';
import './site.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['400', '500', '600', '800'], display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME} — ${TITLE_STEM}`, template: `%s · ${SITE_NAME}` },
  robots: siteEnv.isProduction ? { index: true, follow: true } : { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-surface text-ink font-sans">
        <PilotProvider>
          <JoinProvider>
            <AnnouncementBar />
            <SiteHeader />
            {children}
            <SiteFooter />
          </JoinProvider>
        </PilotProvider>
        {/* Cookieless, no banner. Only on Vercel: elsewhere `/_vercel/insights/script.js` would 404. */}
        {process.env.VERCEL_ENV ? <SiteAnalytics /> : null}
      </body>
    </html>
  );
}
