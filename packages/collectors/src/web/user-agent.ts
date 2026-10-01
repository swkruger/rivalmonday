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
  return { status: res.status, body: await readCapped(res.body) };
};

/** Reads at most MAX_BODY bytes from a response stream, then cancels it so the rest is never downloaded. */
async function readCapped(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const buf = new Uint8Array(Math.min(total, MAX_BODY));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.length, buf.length - offset);
    buf.set(take === chunk.length ? chunk : chunk.subarray(0, take), offset);
    offset += take;
  }
  return new TextDecoder().decode(buf);
}

/** Hostname without a leading "www." — rate limits and same-site checks treat both as one site. */
export function siteHost(url: string): string {
  return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
}
