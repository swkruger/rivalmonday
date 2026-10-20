import type { Metadata } from 'next';
import { RIVAL_MONDAY_TOKENS } from '@cs/email/branding';
import { themeVars, Wordmark } from '@cs/ui';
import { BOT_TOKEN, BOT_USER_AGENT } from '@cs/collectors';

/**
 * Phase 7a1 §3.5: public crawler-information page. Always Rival Monday branded (never an agency's, whatever the host),
 * and it reads no viewer data. Copy is owner-approved; keep it in step with the crawler's behaviour (collectors CLAUDE.md).
 */
export const metadata: Metadata = {
  title: { absolute: 'RivalMondayBot · Rival Monday' },
  description: 'About RivalMondayBot, the web crawler for Rival Monday.',
  robots: { index: true, follow: true },
};

export default function BotPage() {
  return (
    <main style={themeVars(RIVAL_MONDAY_TOKENS) as React.CSSProperties} className="min-h-screen bg-canvas px-4 py-12 text-ink">
      <div className="mx-auto max-w-[720px] space-y-5 leading-relaxed">
        <Wordmark />
        <h1 className="text-3xl font-bold">RivalMondayBot</h1>
        <p>
          RivalMondayBot is the web crawler for Rival Monday, a service that helps local businesses keep track of what&apos;s publicly
          visible about their market — prices, offers and services posted on public websites.
        </p>
        <p>
          <strong>How to recognise it.</strong> Our requests send the user agent <code className="break-all">{BOT_USER_AGENT}</code>. The
          robots.txt token is <code>{BOT_TOKEN}</code>.
        </p>
        <p>
          <strong>What it does.</strong> It visits a small number of public pages per site, about once a week. It never logs in, submits
          forms, or tries to get past paywalls, CAPTCHAs or bot protection.
        </p>
        <p>
          <strong>How it behaves.</strong> It follows robots.txt (RFC 9309), including <code>Crawl-delay</code>. If your robots.txt
          can&apos;t be fetched because of a server error, it doesn&apos;t crawl. It waits at least 3 seconds between requests to the same
          site.
        </p>
        <p>
          <strong>How to opt out.</strong> Add this to your robots.txt and we&apos;ll stop visiting:
        </p>
        <pre className="overflow-x-auto rounded-md bg-[#EEF2F6] p-4 text-sm">{`User-agent: ${BOT_TOKEN}\nDisallow: /`}</pre>
        <p>
          <strong>Contact.</strong> Questions or problems: <a className="text-secondary underline" href="mailto:bot@rivalmonday.app">bot@rivalmonday.app</a>.
        </p>
      </div>
    </main>
  );
}
