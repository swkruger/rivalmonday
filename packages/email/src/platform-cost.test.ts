import { describe, expect, it } from 'vitest';
import { resolveBranding } from './branding';
import { renderEmail } from './render';

const props = (o: object = {}) => ({
  branding: resolveBranding('Rival Monday', null),
  label: 'OpenRouter',
  amountText: '$12.34',
  daysLeft: 5 as number | null,
  billingUrl: 'https://openrouter.ai/settings/credits' as string | null,
  costsUrl: 'https://app.example/platform/costs',
  ...o,
});

describe('platform_cost_low email', () => {
  it('platform-cost-low renders subject and body copy exactly', async () => {
    const out = await renderEmail({ template: 'platform_cost_low', props: props() });
    expect(out.subject).toBe('Rival Monday: low balance on OpenRouter');
    expect(out.text).toContain(
      'OpenRouter is running low: $12.34 left, about 5 days at the current rate. Top up: https://openrouter.ai/settings/credits. See all costs: https://app.example/platform/costs',
    );
    expect(out.html).toContain('#2A6BAC');
  });

  it('days clause: less than a day, about 1 day, about N days', async () => {
    const text = async (daysLeft: number) => (await renderEmail({ template: 'platform_cost_low', props: props({ daysLeft }) })).text;
    expect(await text(0)).toContain('$12.34 left, less than a day at the current rate.');
    expect(await text(1)).toContain('$12.34 left, about 1 day at the current rate.');
    expect(await text(5)).toContain('$12.34 left, about 5 days at the current rate.');
  });

  it('omits Top up when billingUrl null, and the days clause when daysLeft null', async () => {
    const out = await renderEmail({ template: 'platform_cost_low', props: props({ billingUrl: null, daysLeft: null }) });
    expect(out.text).toContain('OpenRouter is running low: $12.34 left. See all costs: https://app.example/platform/costs');
    expect(out.text).not.toContain('Top up');
    expect(out.text).not.toContain('about');
  });
});
