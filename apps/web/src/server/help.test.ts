import { createAccessContext } from '@cs/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ tryCallTool: vi.fn() }));
vi.mock('./tools', () => ({ tryCallTool: m.tryCallTool }));
const { helpGuides, helpClientName } = await import('./help');

const A = '00000000-0000-4000-8000-00000000000a';
const C = '00000000-0000-4000-8000-0000000000c1';
const ctx = () => createAccessContext({ agencyId: A, userId: 'u', role: 'agency_admin', clientScope: 'all', features: [] });
beforeEach(() => m.tryCallTool.mockReset());

describe('helpGuides', () => {
  it('returns the help keys from list_help_guides', async () => {
    m.tryCallTool.mockResolvedValue({ guides: [{ helpKey: 'page:overview' }, { helpKey: 'page:alerts' }] });
    const s = await helpGuides(ctx(), 'client', C);
    expect([...s].sort()).toEqual(['page:alerts', 'page:overview']);
    expect(m.tryCallTool).toHaveBeenCalledWith(expect.anything(), 'list_help_guides', { context: 'client', clientId: C });
  });
  it('omits clientId when none is given', async () => {
    m.tryCallTool.mockResolvedValue({ guides: [] });
    await helpGuides(ctx(), 'agency');
    expect(m.tryCallTool).toHaveBeenCalledWith(expect.anything(), 'list_help_guides', { context: 'agency' });
  });
  it('a refusal (null) or a thrown error is the empty set', async () => {
    m.tryCallTool.mockResolvedValueOnce(null);
    expect((await helpGuides(ctx(), 'platform')).size).toBe(0);
    m.tryCallTool.mockRejectedValueOnce(new Error('db down'));
    expect((await helpGuides(ctx(), 'platform')).size).toBe(0);
  });
});

describe('helpClientName', () => {
  it('reads the name through get_client_profile and is null on refusal or error', async () => {
    m.tryCallTool.mockResolvedValueOnce({ name: 'Bob HVAC' });
    expect(await helpClientName(ctx(), C)).toBe('Bob HVAC');
    expect(m.tryCallTool).toHaveBeenCalledWith(expect.anything(), 'get_client_profile', { clientId: C });
    m.tryCallTool.mockResolvedValueOnce(null);
    expect(await helpClientName(ctx(), C)).toBeNull();
    m.tryCallTool.mockRejectedValueOnce(new Error('x'));
    expect(await helpClientName(ctx(), C)).toBeNull();
  });
});
