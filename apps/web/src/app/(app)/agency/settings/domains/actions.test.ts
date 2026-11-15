import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ runTool: vi.fn(), revalidate: vi.fn(), ctx: { role: 'agency_admin' } as Record<string, unknown> }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: m.ctx }) }));
vi.mock('@/server/run-tool', () => ({ runTool: (...a: unknown[]) => m.runTool(...a) }));
vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => m.revalidate(...a) }));
const a = await import('./actions');

const ok = { ok: true } as const;
const form = (o: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  m.runTool.mockReset().mockResolvedValue({ ok: true, data: { ok: true } });
  m.revalidate.mockReset();
});

describe('domains actions', () => {
  it('each action calls its tool through runTool and revalidates the page', async () => {
    const cases: [(p: typeof ok, fd: FormData) => Promise<unknown>, FormData, string, Record<string, unknown>][] = [
      [a.setCustomDomainAction, form({ hostname: ' intel.brightline.co ' }), 'set_custom_domain', { hostname: 'intel.brightline.co' }],
      [a.removeCustomDomainAction, form(), 'remove_custom_domain', {}],
      [a.setSendingDomainAction, form({ domain: 'brightline.co', localPart: 'hello' }), 'set_sending_domain', { domain: 'brightline.co', localPart: 'hello' }],
      [a.setSendingDomainAction, form({ domain: 'brightline.co', localPart: '  ' }), 'set_sending_domain', { domain: 'brightline.co' }],
      [a.removeSendingDomainAction, form(), 'remove_sending_domain', {}],
    ];
    for (const [action, fd, tool, input] of cases) {
      m.runTool.mockClear();
      m.revalidate.mockClear();
      expect(await action(ok, fd)).toEqual({ ok: true });
      expect(m.runTool).toHaveBeenCalledWith(m.ctx, tool, input);
      expect(m.revalidate).toHaveBeenCalledWith('/agency/settings/domains');
    }
  });

  it('actions map refusals to their copy', async () => {
    for (const [action, error] of [
      [a.setCustomDomainAction, 'Use a subdomain such as intel.youragency.com.'],
      [a.setCustomDomainAction, 'This domain is already in use.'],
      [a.setSendingDomainAction, 'Use lower-case letters, digits, dots, hyphens or underscores.'],
      [a.removeCustomDomainAction, "We couldn't reach the domain service. Please try again in a few minutes."],
      [a.removeSendingDomainAction, 'Not found'],
    ] as const) {
      m.runTool.mockResolvedValue({ ok: false, error });
      m.revalidate.mockClear();
      expect(await action(ok, form({ hostname: 'x', domain: 'y' }))).toEqual({ ok: false, error });
      expect(m.revalidate).not.toHaveBeenCalled();
    }
  });
});
