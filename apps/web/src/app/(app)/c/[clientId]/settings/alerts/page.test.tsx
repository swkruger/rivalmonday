// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@cs/engine', () => ({ ALERTS_PER_DAY: 5 }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ ctx: { role: 'agency_admin', userId: 'u1', features: new Set() } }) }));
vi.mock('@/server/tools', () => ({
  callTool: async (_c: unknown, name: string) =>
    name === 'get_alert_rules' ? { alert: 70, brief: 40, custom: false, defaults: { alert: 70, brief: 40 } } : { name: 'A1 HVAC' },
}));
vi.mock('@/server/client-settings-nav', () => ({ hasClientSettings: async () => true }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('./alert-rules-form', () => ({ AlertRulesForm: () => null }));
vi.mock('./actions', () => ({ saveAlertRulesAction: vi.fn() }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set<string>() }));
vi.mock('@/components/help/tip-row', () => ({ TipRow: () => null }));

import AlertRulesPage from './page';

afterEach(cleanup);

describe('AlertRulesPage', () => {
  it('alert rules page says "3 a day" from ALERTS_PER_DAY', async () => {
    const { container } = render(await AlertRulesPage({ params: Promise.resolve({ clientId: 'c1' }) }));
    expect(container.textContent).toContain('limited to 5 a day');
    expect(container.textContent).not.toContain('3 a day');
  });
});
