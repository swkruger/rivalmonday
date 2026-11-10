import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { SITE_NAME, SITE_URL } from '../../content/site';
import { siteEnv } from '../lib/env';
import { organizationLd, websiteLd } from '../lib/json-ld';
import { OG } from '../lib/og-theme';
import { JoinProvider } from '../components/join/join-provider';
import { JsonLd } from '../components/seo/json-ld';
import { AnnouncementBar } from '../components/shell/announcement-bar';
import { PilotProvider } from '../components/shell/pilot-context';
import { SideProvider } from '../components/shell/side-context';
import { SiteAnalytics } from '../components/shell/site-analytics';
import { SiteFooter } from '../components/shell/site-footer';
import { SiteHeader } from '../components/shell/site-header';
import { footerColumns, navMenus, sidePaths } from '../components/shell/nav-items';
import './site.css';

// `optional`, not `swap`: the size-matched fallback needs Arial, so without it (Android, Linux) the swap reflows the hero (CLS 0.3).
// Inter (OFL, `fonts/LICENSE-Inter.txt`) ships in the repo: `next/font/google` fetches at build time and failed CI builds intermittently.
const inter = localFont({
  variable: '--font-inter',
  display: 'optional',
  src: './fonts/inter-latin-wght-normal.woff2',
  weight: '100 900',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` },
  robots: siteEnv.isProduction ? { index: true, follow: true } : { index: false, follow: false },
};

/** Browser UI colour matches the page canvas. */
export const viewport: Viewport = { themeColor: OG.canvas };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-US" className={inter.variable}>
      <body className="bg-surface text-ink font-sans">
        <JsonLd data={[organizationLd(Object.values(siteEnv.social).filter((v): v is string => !!v)), websiteLd()]} />
        <SideProvider paths={sidePaths()}>
          <PilotProvider>
            <JoinProvider>
              <AnnouncementBar />
              <SiteHeader menus={navMenus()} />
              {children}
              <SiteFooter columns={footerColumns()} />
            </JoinProvider>
          </PilotProvider>
        </SideProvider>
        {/* Cookieless, no banner. Only on Vercel: elsewhere `/_vercel/insights/script.js` would 404. */}
        {process.env.VERCEL_ENV ? <SiteAnalytics /> : null}
      </body>
    </html>
  );
}
