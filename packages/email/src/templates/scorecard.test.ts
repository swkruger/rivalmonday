import { describe, expect, it } from 'vitest';
import { EMAIL_PREVIEWS } from '../previews';
import { renderEmail } from '../render';

describe('scorecard email (18d)', () => {
  it('shows the events and Tripadvisor columns with short labels and keys', async () => {
    const p = EMAIL_PREVIEWS.find((x) => x.id === 'brief.starting_point_venues')?.payload;
    if (p?.template !== 'brief') throw new Error('fixture');
    const html = (await renderEmail(p)).html;
    const table = html.match(/<table[^>]*aria-label="Scorecard[\s\S]*?<\/table>/)?.[0] ?? '';
    expect([...table.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1])).toEqual(['Business', 'Stars', 'Events', 'Tripadvisor']);
    expect(table).toContain('4.5');
    expect(html).toContain('Events: upcoming events you and your rivals list');
    expect(html).toContain('Tripadvisor: Tripadvisor rating');
  });
});
