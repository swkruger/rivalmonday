import type { SiteFeatureCategory } from '@cs/core';

/**
 * Third-party widgets a competitor's page can embed, matched on the host of a
 * `script[src]` / `iframe[src]` / `link[href]` (and, where listed, `a[href]`).
 * Only hosts confirmed from the vendor's public embed snippet are listed; unconfirmable
 * vendors are deliberately absent (ServiceTitan, NexHealth, LocalMed, Synchrony,
 * Service Finance, NiceJob). Call tracking is out of scope (ruling 2026-11-08).
 */
export interface SiteFeatureSignature {
  id: string;
  category: SiteFeatureCategory;
  vendor: string;
  /** Exact host or `.`-suffix match (`connect.podium.com` matches `podium.com`). */
  hosts: readonly string[];
  /** Optional extra test on the URL path. */
  path?: RegExp;
  tags: readonly ('script' | 'iframe' | 'link' | 'a')[];
  /** Registry version that introduced the entry. */
  since: number;
}

export const SITE_FEATURE_REGISTRY_VERSION = 1;

const EMBED = ['script', 'iframe'] as const;
const EMBED_LINK = ['script', 'iframe', 'a'] as const;

export const SITE_FEATURE_REGISTRY: readonly SiteFeatureSignature[] = [
  // online_booking
  { id: 'housecall_pro', category: 'online_booking', vendor: 'Housecall Pro', hosts: ['housecallpro.com'], tags: EMBED_LINK, since: 1 },
  { id: 'jobber', category: 'online_booking', vendor: 'Jobber', hosts: ['getjobber.com'], path: /\/client_hubs\//i, tags: EMBED_LINK, since: 1 },
  { id: 'calendly', category: 'online_booking', vendor: 'Calendly', hosts: ['calendly.com'], tags: EMBED_LINK, since: 1 },
  { id: 'acuity', category: 'online_booking', vendor: 'Acuity Scheduling', hosts: ['acuityscheduling.com'], tags: EMBED_LINK, since: 1 },
  { id: 'setmore', category: 'online_booking', vendor: 'Setmore', hosts: ['setmore.com'], tags: EMBED_LINK, since: 1 },
  { id: 'zocdoc', category: 'online_booking', vendor: 'Zocdoc', hosts: ['zocdoc.com'], tags: EMBED_LINK, since: 1 },
  // live_chat
  { id: 'podium', category: 'live_chat', vendor: 'Podium', hosts: ['podium.com'], tags: EMBED, since: 1 },
  { id: 'intercom', category: 'live_chat', vendor: 'Intercom', hosts: ['intercom.io', 'intercomcdn.com'], tags: EMBED, since: 1 },
  { id: 'drift', category: 'live_chat', vendor: 'Drift', hosts: ['driftt.com'], tags: EMBED, since: 1 },
  { id: 'livechat', category: 'live_chat', vendor: 'LiveChat', hosts: ['livechatinc.com'], tags: EMBED, since: 1 },
  { id: 'tawk_to', category: 'live_chat', vendor: 'tawk.to', hosts: ['tawk.to'], tags: EMBED, since: 1 },
  { id: 'tidio', category: 'live_chat', vendor: 'Tidio', hosts: ['tidio.co'], tags: EMBED, since: 1 },
  { id: 'zendesk_chat', category: 'live_chat', vendor: 'Zendesk', hosts: ['zdassets.com'], tags: EMBED, since: 1 },
  { id: 'hubspot_chat', category: 'live_chat', vendor: 'HubSpot', hosts: ['usemessages.com'], tags: EMBED, since: 1 },
  // financing
  { id: 'wisetack', category: 'financing', vendor: 'Wisetack', hosts: ['wisetack.com', 'wisetack.us'], tags: EMBED_LINK, since: 1 },
  { id: 'greensky', category: 'financing', vendor: 'GreenSky', hosts: ['greensky.com'], tags: EMBED_LINK, since: 1 },
  { id: 'carecredit', category: 'financing', vendor: 'CareCredit', hosts: ['carecredit.com'], tags: EMBED_LINK, since: 1 },
  { id: 'sunbit', category: 'financing', vendor: 'Sunbit', hosts: ['sunbit.com'], tags: EMBED_LINK, since: 1 },
  { id: 'affirm', category: 'financing', vendor: 'Affirm', hosts: ['affirm.com'], tags: EMBED_LINK, since: 1 },
  { id: 'cherry', category: 'financing', vendor: 'Cherry', hosts: ['withcherry.com'], tags: EMBED_LINK, since: 1 },
  // review_widget
  { id: 'birdeye', category: 'review_widget', vendor: 'Birdeye', hosts: ['birdeye.com'], tags: EMBED, since: 1 },
  { id: 'trustindex', category: 'review_widget', vendor: 'Trustindex', hosts: ['trustindex.io'], tags: EMBED, since: 1 },
];
