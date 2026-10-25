import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { AgencyPlanChangeProps } from './types';

const branding = resolveBranding('Rival Monday', null);
const base: AgencyPlanChangeProps = {
  branding, recipientName: 'Ann', agencyName: 'Peak Digital',
  before: { basePriceCents: 22900, includedSeats: 3, seatPriceCents: 9900 },
  after: { basePriceCents: 19900, includedSeats: 5, seatPriceCents: 7900 },
  featuresAdded: [], featuresRemoved: [], effective: { kind: 'next_billing', date: '2026-11-03' },
};
const render = (o: Partial<AgencyPlanChangeProps>) => renderEmail({ template: 'agency_plan_change', props: { ...base, ...o } });

describe('agency_plan_change email', () => {
  it('paid variant shows date and old→new terms', async () => {
    const r = await render({});
    expect(r.subject).toBe('Your Rival Monday plan is changing');
    expect(r.text).toContain('Hi Ann,');
    expect(r.text).toContain('From November 3, 2026, your plan is $199/month including 5 client seats, then $79 per extra seat (was $229 with 3 seats, $99 each).');
    expect(r.text).toContain('Questions? Reply to this email.');
  });
  it('null date says your next billing date', async () => {
    const r = await render({ effective: { kind: 'next_billing', date: null } });
    expect(r.text).toContain('From your next billing date, your plan is $199/month');
  });
  it('on_subscribe variant', async () => {
    const r = await render({ effective: { kind: 'on_subscribe' } });
    expect(r.text).toContain('Your plan is now $199/month including 5 client seats, then $79 per extra seat. These prices apply when you subscribe.');
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
