import { createHash } from 'node:crypto';

/**
 * 7c2 rehearsal fixture websites (plan Decision 11), served by `apps/worker/src/cli/fixture-hosts.ts` on
 * `fx1…fx5.rehearsal.rivalmonday.app`. A client group `g<group>` gets one variant per ISO week
 * (`hash(g<group>, isoWeek) mod 10`); variants 0–6 serve a mutation from Wednesday 00:00 UTC (0–1 a price swap,
 * 2–3 a reworded paragraph, 4–6 an added offer), 7–9 stay quiet. Mon/Tue always serve the baseline, so the week's
 * first captures are the reference. Pages are deterministic and self-contained (no images, scripts or stylesheets).
 */

/** `fx5` (index 4 of fx1…fx5) sends `Crawl-delay: 30`, to show one slow host does not hold up the others. */
export const FIXTURE_CRAWL_DELAY_HOST_INDEX = 4;
export const FIXTURE_MUTATING_VARIANTS = 7;

export interface FixtureResponse { status: number; headers: Record<string, string>; body: string }

const PAGE = /^\/g([1-9]\d{0,5})\/s([1-9]\d{0,2})(?:\/(pricing|services|offers))?\/?$/;
const HTML = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
const TEXT = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' };
const notFound = (): FixtureResponse => ({ status: 404, headers: TEXT, body: 'Not found\n' });

const u32 = (s: string) => createHash('sha256').update(s).digest().readUInt32BE(0);

/** ISO-8601 week of `now` (UTC), e.g. `2026-W44`. */
export function isoWeekKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = d.getUTCDay() || 7; // Mon = 1 … Sun = 7
  d.setUTCDate(d.getUTCDate() + 4 - dow); // the Thursday of this ISO week decides its year
  const year = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** This week's variant (0–9) of client group `group`. */
export const fixtureVariant = (group: number, now: Date): number => u32(`g${group}|${isoWeekKey(now)}`) % 10;

type Mutation = 'price' | 'reword' | 'offer' | null;
function mutation(group: number, now: Date): Mutation {
  const day = now.getUTCDay(); // Sun = 0; Wed 00:00 UTC … Sun 23:59 UTC is the mutation window of the ISO week
  if (day === 1 || day === 2) return null;
  const v = fixtureVariant(group, now);
  return v >= FIXTURE_MUTATING_VARIANTS ? null : v < 2 ? 'price' : v < 4 ? 'reword' : 'offer';
}

function hostIndex(host: string): number {
  const m = /^fx(\d+)\./i.exec(host);
  return m ? Number(m[1]) - 1 : -1;
}

function robots(host: string): string {
  const lines = ['User-agent: *', 'Allow: /'];
  if (hostIndex(host) === FIXTURE_CRAWL_DELAY_HOST_INDEX) lines.push('Crawl-delay: 30');
  return `${lines.join('\n')}\n`;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function site(group: number, siteNo: number, m: Mutation) {
  const h = u32(`site|${group}|${siteNo}`);
  const name = `Group ${group} Site ${siteNo} Home Services`;
  const basePrice = 79 + (h % 9) * 10;
  const tuneUp = m === 'price' ? basePrice + 15 : basePrice;
  const intro = m === 'reword'
    ? `${name} now offers same-day repairs across the metro, with upfront pricing before any work starts.`
    : `${name} is a family-owned team serving the metro area with heating, cooling and plumbing repairs.`;
  const offers = ['Free estimates on new system installs', 'Seniors save 10 % on every repair'];
  if (m === 'offer') offers.unshift(`Limited time: $${25 + (h % 4) * 5} off any service call this week`);
  const prices: [string, number][] = [['Seasonal tune-up', tuneUp], ['Diagnostic visit', 59 + (h % 5) * 5], ['Drain cleaning', 129 + (h % 7) * 10]];
  return { name, intro, offers, prices, tuneUp };
}

function page(title: string, name: string, base: string, main: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)} | ${esc(name)}</title>`,
    '<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;color:#0B2540}nav a{margin-right:1rem}</style>',
    '</head><body>',
    `<header><h1>${esc(name)}</h1><nav><a href="${base}/">Home</a><a href="${base}/services">Services</a><a href="${base}/pricing">Pricing</a><a href="${base}/offers">Offers</a></nav></header>`,
    `<main>${main}</main>`,
    '<footer><p>Rehearsal fixture site. Not a real business.</p></footer>',
    '</body></html>',
    '',
  ].join('\n');
}

/** The response for `host` + `path` at `now`: `/robots.txt`, or a page `/g<group>/s<site>/{,pricing,services,offers}`; else 404. */
export function fixtureResponse(host: string, path: string, now: Date): FixtureResponse {
  const pathname = path.split(/[?#]/)[0] ?? '';
  if (pathname === '/robots.txt') return { status: 200, headers: TEXT, body: robots(host) };
  const p = PAGE.exec(pathname);
  if (!p) return notFound();
  const group = Number(p[1]);
  const siteNo = Number(p[2]);
  const kind = p[3] ?? 'home';
  const s = site(group, siteNo, mutation(group, now));
  const base = `/g${group}/s${siteNo}`;
  const offerList = `<ul>${s.offers.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`;
  const priceRows = s.prices.map(([n, v]) => `<tr><td>${esc(n)}</td><td>$${v}</td></tr>`).join('');
  const main =
    kind === 'pricing' ? `<h2>Pricing</h2><table><tbody>${priceRows}</tbody></table><p>Prices include parts for standard jobs.</p>`
    : kind === 'services' ? `<h2>Services</h2><p>${esc(s.intro)}</p><ul><li>AC repair and installation</li><li>Furnace repair</li><li>Water heaters</li><li>Drain cleaning</li></ul>`
    : kind === 'offers' ? `<h2>Current offers</h2>${offerList}`
    : `<h2>Welcome</h2><p>${esc(s.intro)}</p><p>Seasonal tune-up from $${s.tuneUp}.</p><h2>Offers</h2>${offerList}`;
  const title = kind === 'home' ? 'Home' : kind[0]!.toUpperCase() + kind.slice(1);
  return { status: 200, headers: HTML, body: page(title, s.name, base, main) };
}
