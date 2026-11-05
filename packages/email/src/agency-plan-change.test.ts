import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { AgencyPlanChangeProps } from './types';

const branding = resolveBranding('Rival Monday', null);
const base: AgencyPlanChangeProps = {
  branding, recipientName: 'Ann', agencyName: 'Peak Digital',
  before: { basePriceCents: 22900, basePriceYearCents: null, includedSeats: 3, seatTiers: [{ upTo: null, unitCents: 9900 }], tiers: [{ fromClient: 4, toClient: null, unitCents: 9900 }] },
  after: { basePriceCents: 22900, basePriceYearCents: 229000, includedSeats: 3, seatTiers: [{ upTo: 7, unitCents: 7900 }, { upTo: null, unitCents: 5900 }], tiers: [{ fromClient: 4, toClient: 10, unitCents: 7900 }, { fromClient: 11, toClient: null, unitCents: 5900 }] },
  featuresAdded: [], featuresRemoved: [], effective: { kind: 'next_billing', date: '2026-11-03' },
};
const render = (o: Partial<AgencyPlanChangeProps>) => renderEmail({ template: 'agency_plan_change', props: { ...base, ...o } });

describe('agency_plan_change email', () => {
  it('paid variant shows date and old→new terms', async () => {
    const r = await render({});
    expect(r.subject).toBe('Your Rival Monday plan is changing');
    expect(r.text).toContain('Hi Ann,');
    expect(r.text).toContain('From November 3, 2026, your plan is $229/mo (or $2,290/yr) · 3 clients included · clients 4–10: $79 each · clients 11+: $59 each (was $229/mo · 3 clients included · clients 4+: $99 each).');
    expect(r.text).toContain('Questions? Reply to this email.');
  });
  it('null date says your next billing date', async () => {
    const r = await render({ effective: { kind: 'next_billing', date: null } });
    expect(r.text).toContain('From your next billing date, your plan is $229/mo');
  });
  it('on_subscribe variant', async () => {
    const r = await render({ effective: { kind: 'on_subscribe' } });
    expect(r.text).toContain('Your plan is now $229/mo (or $2,290/yr) · 3 clients included · clients 4–10: $79 each · clients 11+: $59 each. These prices apply when you subscribe.');
    expect(r.text).not.toContain('was $229');
  });
  it('features lines only when changed', async () => {
    const none = await render({});
    expect(none.text).not.toContain('Now included');
    expect(none.text).not.toContain('No longer included');
    const both = await render({ featuresAdded: ['ask', 'mcp'], featuresRemoved: ['mcp'] });
    expect(both.text).toContain('Now included: Ask, MCP access.');
    expect(both.text).toContain('No longer included: MCP access. This applies straight away.');
  });
  it('never mentions an operator name (props carry none)', async () => {
    const r = await render({});
    expect(r.html).not.toMatch(/operator/i);
    expect(r.text).not.toMatch(/operator/i);
  });
});
