import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';
import type { PlatformOpsAlertProps } from './types';

const clients = (n: number) => Array.from({ length: n }, (_, i) => ({ clientName: `Client ${i + 1}`, agencyName: `Agency ${i + 1}` }));
const props = (o: Partial<PlatformOpsAlertProps> = {}): PlatformOpsAlertProps => ({
  branding: resolveBranding('Rival Monday', null),
  checkpoint: 'generation_closed',
  severity: 'critical',
  deliveryDate: '2026-10-26',
  clients: clients(2),
  healthUrl: 'https://app.example/platform/health',
  ...o,
});
const render = (o: Partial<PlatformOpsAlertProps> = {}) => renderEmail({ template: 'platform_ops_alert', props: props(o) });

describe('platform_ops_alert email', () => {
  it('renders subject and list, caps at 20', async () => {
    const out = await render({ clients: clients(23) });
    expect(out.subject).toBe('Rival Monday ops: 23 brief(s) not ready for 2026-10-26');
    expect(out.text).toContain('Generation closed at Friday 12:00 client time and these clients have no ready brief for 2026-10-26.');
    expect(out.text).toContain('Agency 1 — Client 1');
    expect(out.text).toContain('Agency 20 — Client 20');
    expect(out.text).not.toContain('Client 21');
    expect(out.text).toContain('and 3 more');
    expect(out.text).toContain('Open Health: https://app.example/platform/health');
    expect(out.text).toContain('Platform ops alert');
    expect(out.html).toContain('#2A6BAC');
  });

  it('no "more" line at 20 or fewer', async () => {
    const out = await render({ clients: clients(20) });
    expect(out.text).toContain('Agency 20 — Client 20');
    expect(out.text).not.toContain('more');
  });

  it('pre_delivery lead line', async () => {
    const out = await render({ checkpoint: 'pre_delivery' });
    expect(out.subject).toBe('Rival Monday ops: 2 brief(s) not ready for 2026-10-26');
    expect(out.text).toContain('Delivery is Monday 07:00 client time and these briefs are missing or failed.');
  });

  it('pre_delivery_unapproved: awaiting-approval subject and lead line', async () => {
    const out = await render({ checkpoint: 'pre_delivery_unapproved', severity: 'warning', clients: clients(1) });
    expect(out.subject).toBe('Rival Monday ops: 1 brief(s) awaiting approval for 2026-10-26');
    expect(out.text).toContain('These briefs are ready but not approved, and auto-send is off: they will not go out Monday 07:00 unless approved.');
  });

  it('starting_point_late: client subject and lead line', async () => {
    const out = await render({ checkpoint: 'starting_point_late', deliveryDate: '2026-10-22', clients: [{ clientName: 'A1 HVAC', agencyName: 'Agency A' }] });
    expect(out.subject).toBe('Rival Monday ops: starting point late for A1 HVAC');
    expect(out.text).toContain('This starting point is not ready 6 hours after it was due.');
    expect(out.text).toContain('Agency A — A1 HVAC');
  });
});
