'use client';

import { Analytics } from '@vercel/analytics/next';
import { analyticsBeforeSend } from '../../lib/analytics';

/** Client wrapper: a server layout cannot pass the `beforeSend` function to `<Analytics>`. */
export function SiteAnalytics() {
  return <Analytics beforeSend={analyticsBeforeSend} />;
}
