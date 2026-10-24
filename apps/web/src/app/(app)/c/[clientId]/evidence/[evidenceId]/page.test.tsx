import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_owner', userId: 'u1' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => null }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasChannel: () => false, hasFeature: () => false, hasPermission: () => false }));
vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }));
vi.mock('@/components/ask/save-recommendation-dialog', () => ({ RATIONALE_MAX: 10, TITLE_MAX: 10, SaveRecommendationDialog: () => null }));
vi.mock('../../ask/actions', () => ({ saveAskRecommendation: vi.fn() }));

const { default: EvidencePage } = await import('./page');

const C = '00000000-0000-4000-8000-0000000000c1';
const evidence = (channel: string) => ({
  channel, channelLabel: channel, competitorName: 'Smith', capturedAt: '2026-10-21T14:00:00Z', captureStatus: 'ok', kind: 'text', url: null,
  sha256: 'x', legalHold: false, citedBy: [], captureId: 'cap1',
});
const mount = (channel: string, extra: Record<string, unknown> = {}, timezone = 'UTC') =>
  callTool.mockImplementation(async (_c: unknown, name: string) => (name === 'get_client_profile' ? { name: 'Cool Air', timezone } : { ...evidence(channel), ...extra }));

/** All text in a React element tree (not rendered): every prop value, so `DetailRow value={…}` is included. */
function textOf(node: unknown): string {
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node || typeof node !== 'object') return '';
  return Object.values((node as { props?: Record<string, unknown> }).props ?? {}).map(textOf).join(' ');
}

/** Depth-first search of a React element tree (not rendered: the compare body is an async server component). */
function hasId(node: unknown, id: string): boolean {
  if (Array.isArray(node)) return node.some((n) => hasId(n, id));
  if (!node || typeof node !== 'object') return false;
  const props = (node as { props?: Record<string, unknown> }).props;
  return !!props && (props.id === id || hasId(props.children, id));
}

/** The `ComparePrevious` element (async server component) inside the page tree. */
function findSection(node: unknown): { type: unknown; props: unknown } {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findSection(n);
      if (f) return f;
    }
    return undefined as never;
  }
  if (!node || typeof node !== 'object') return undefined as never;
  const el = node as { type?: unknown; props?: { clientId?: string; captureId?: string; children?: unknown } };
  if (typeof el.type === 'function' && el.props?.captureId) return el as never;
  return findSection(el.props?.children);
}

describe('Evidence page "Compare with previous"', () => {
  it('section only for web evidence', async () => {
    mount('web');
    expect(hasId(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }), 'compare-previous-heading')).toBe(true);
    mount('google_ads');
    expect(hasId(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }), 'compare-previous-heading')).toBe(false);
  });

  it('a throw from compare_captures shows the note instead of failing the page', async () => {
    callTool.mockImplementation(async (_c: unknown, name: string) => {
      if (name === 'compare_captures') throw new Error('boom');
      return name === 'get_client_profile' ? { name: 'Cool Air', timezone: 'UTC' } : evidence('web');
    });
    const section = findSection(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }));
    const body = (await (section.type as (p: unknown) => Promise<unknown>)(section.props)) as { props: { children: string } };
    expect(body.props.children).toBe('Comparison not available for this capture.');
  });

  it('evidence captured time has the client zone label', async () => {
    mount('web', {}, 'America/Chicago');
    const tree = await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) });
    expect(textOf(tree)).toContain('Oct 21, 9:00 AM CT');
  });

  it('robots_disallowed status reads "Site asks not to be monitored"', async () => {
    mount('web', { captureStatus: 'robots_disallowed' });
    const tree = await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) });
    expect(textOf(tree)).toContain('Site asks not to be monitored');
    expect(textOf(tree)).not.toContain('robots_disallowed');
  });
});
