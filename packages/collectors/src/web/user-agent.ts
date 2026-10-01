/** Robots.txt product token. Honest identification is a legal/ethical requirement (spec §4.2). */
export const BOT_TOKEN = 'RivalMondayBot';
export const BOT_USER_AGENT = `Mozilla/5.0 (compatible; ${BOT_TOKEN}/1.0; +https://rivalmonday.com/bot)`;

export type FetchText = (url: string) => Promise<{ status: number; body: string }>;

const MAX_BODY = 512 * 1024;

export const defaultFetchText: FetchText = async (url) => {
  const res = await fetch(url, {
    headers: { 'user-agent': BOT_USER_AGENT, accept: 'text/plain,text/html,application/xml;q=0.9,*/*;q=0.5' },
    redirect: 'follow',
    signal: AbortSignal.timeout(10_000),
  });
  const buf = new Uint8Array(await res.arrayBuffer());
  return { status: res.status, body: new TextDecoder().decode(buf.subarray(0, MAX_BODY)) };
};

/** Hostname without a leading "www." — rate limits and same-site checks treat both as one site. */
export function siteHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}
