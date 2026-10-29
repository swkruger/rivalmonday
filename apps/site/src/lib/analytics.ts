import type { BeforeSendEvent } from '@vercel/analytics/next';
import { stripQueryHash } from './sentry-options';

/** Vercel Analytics `beforeSend`: the same URL policy as Sentry, no `?query` or `#fragment` (join links, click ids, `?email=`). */
export function analyticsBeforeSend<E extends Pick<BeforeSendEvent, 'type' | 'url'>>(event: E): E {
  return { ...event, url: stripQueryHash(event.url) };
}
