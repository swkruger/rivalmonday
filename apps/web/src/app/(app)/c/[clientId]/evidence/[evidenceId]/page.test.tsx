import { describe, expect, it, vi } from 'vitest';

const callTool = vi.fn();
const m = vi.hoisted(() => ({ ask: false, dash: false }));
vi.mock('@/server/current-viewer', () => ({ requireContext: async () => ({ viewer: { kind: 'user' }, ctx: { role: 'agency_owner', userId: 'u1' } }) }));
vi.mock('@/server/tools', () => ({ callTool: (...a: unknown[]) => callTool(...a), tryCallTool: (...a: unknown[]) => callTool(...a) }));
vi.mock('@/server/help', () => ({ helpGuides: async () => new Set() }));
vi.mock('@/server/ask', () => ({ assistantNameFor: async () => 'Friday' }));
vi.mock('@/server/db', () => ({ dbs: () => ({ service: {} }) }));
vi.mock('@cs/core', async (orig) => ({ ...(await orig<typeof import('@cs/core')>()), hasChannel: () => m.ask, hasFeature: () => m.dash, hasPermission: () => false }));
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
  return !!props && (props.title === id || hasId(props.children, id));
}

/** Elements of `type` (by function name) in the tree. */
function countByName(node: unknown, name: string): number {
  if (Array.isArray(node)) return node.reduce((n: number, c) => n + countByName(c, name), 0);
  if (!node || typeof node !== 'object') return 0;
  const el = node as { type?: { name?: string }; props?: { children?: unknown } };
  return (typeof el.type === 'function' && el.type.name === name ? 1 : 0) + countByName(el.props?.children, name);
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
    expect(hasId(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }), 'Compare with previous')).toBe(true);
    mount('google_ads');
    expect(hasId(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }), 'Compare with previous')).toBe(false);
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

describe('Evidence page on the sheet', () => {
  const tree = async () => EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) });
  it('only the preview is a Card; detail blocks are Sections', async () => {
    mount('web', { citedBy: [{ eventId: 'ev1', typeLabel: 'Price', summary: 's', occurredAt: '2026-10-20T00:00:00Z' }] });
    const t = await tree();
    expect(countByName(t, 'Card')).toBe(1);
    expect(textOf(t)).toContain('Preview');
    expect(hasId(t, 'Capture details')).toBe(true);
    expect(hasId(t, 'Compare with previous')).toBe(true);
    expect(textOf(t)).toContain('SHA-256');
  });
  it('part of these changes is a Section for dashboard viewers', async () => {
    mount('web', { citedBy: [{ eventId: 'ev1', typeLabel: 'Price', summary: 's', occurredAt: '2026-10-20T00:00:00Z' }] });
    m.dash = true;
    expect(hasId(await tree(), 'Part of these changes')).toBe(true);
    m.dash = false;
  });
});

describe('Evidence page Ask entry point (plan-off, 7a2 D13)', () => {
  const open = async () => textOf(await EvidencePage({ params: Promise.resolve({ clientId: C, evidenceId: 'e1' }) }));
  it('evidence page hides Ask when canAsk is false', async () => {
    mount('web');
    m.ask = true;
    expect(await open()).toContain('Ask Friday about this');
    m.ask = false;
    expect(await open()).not.toContain('Ask Friday');
  });
});
