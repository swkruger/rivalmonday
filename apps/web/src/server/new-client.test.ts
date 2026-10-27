import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  runTool: vi.fn(),
  normalizeLogo: vi.fn(),
  redirect: vi.fn((to: string) => { throw new Error(`NEXT_REDIRECT:${to}`); }),
}));
vi.mock('./run-tool', () => ({ runTool: m.runTool }));
vi.mock('./logo', () => ({
  LOGO_ERROR_COPY: { too_large: 'Logo must be 512 KB or smaller.', unsupported_type: 'Use a PNG, JPEG, WebP or SVG file.', unsafe_svg: 'x', undecodable: "We couldn't read this image." },
  normalizeLogo: m.normalizeLogo,
}));
vi.mock('next/navigation', () => ({ redirect: m.redirect }));

import { createClientFromForm } from './new-client';

const CTX = { role: 'agency_admin', agencyId: 'a1', clientScope: 'all' } as never;
const LOOKUP = { placeId: 'ChIJabcdefghij', cid: null, title: 'Cool Breeze', address: '1 Main St, Round Rock, TX 78681', city: 'Round Rock', category: 'HVAC contractor', phone: null, domain: null, rating: 4.7, votes: 212, lat: 30.5, lng: -97.6 };
const form = (o: Record<string, string | Blob> = {}) => {
  const fd = new FormData();
  const base = { name: 'Cool Breeze', contactName: 'Maria Alvarez', phone: '(512) 555-0187', email: 'maria@x.com', verticalId: 'hvac_plumbing', ...o };
  for (const [k, v] of Object.entries(base)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  m.runTool.mockReset().mockResolvedValue({ ok: true, data: { clientId: 'c1' } });
  m.normalizeLogo.mockReset();
  m.redirect.mockClear();
});

describe('createClientFromForm (steps 1-2 end)', () => {
  it('creates the client with step 1 details and the listing, then goes to setup', async () => {
    await expect(createClientFromForm(CTX, form({ lookup: JSON.stringify(LOOKUP), line1: '1 Main St', city: 'Round Rock', region: 'TX', postalCode: '78681' }), 'active')).rejects.toThrow('NEXT_REDIRECT:/c/c1/setup');
    expect(m.runTool).toHaveBeenCalledTimes(1);
    expect(m.runTool).toHaveBeenCalledWith(CTX, 'create_client', expect.objectContaining({
      name: 'Cool Breeze', verticalId: 'hvac_plumbing', services: [], keywords: [], serviceArea: null, placeId: null, lookup: LOOKUP,
      details: { phone: '(512) 555-0187', address: { line1: '1 Main St', city: 'Round Rock', region: 'TX', postalCode: '78681', country: 'US' }, contact: { name: 'Maria Alvarez', email: 'maria@x.com' } },
    }));
  });

  it('without a listing sends the typed City or ZIP as the locality, and no address when none was typed', async () => {
    await expect(createClientFromForm(CTX, form({ locality: 'Round Rock, TX' }), 'active')).rejects.toThrow('NEXT_REDIRECT');
    const input = m.runTool.mock.calls[0]![2] as Record<string, unknown>;
    expect(input.lookup).toBeUndefined();
    expect(input.details).toEqual({ phone: '(512) 555-0187', locality: 'Round Rock, TX', contact: { name: 'Maria Alvarez', email: 'maria@x.com' } });
    expect(input.status).toBeUndefined();
  });

  it('a prospect is created with status prospect', async () => {
    await expect(createClientFromForm(CTX, form({ locality: '78681' }), 'prospect')).rejects.toThrow('NEXT_REDIRECT');
    expect(m.runTool.mock.calls[0]![2]).toMatchObject({ status: 'prospect' });
  });

  it('a bad listing stops before any write', async () => {
    const r = await createClientFromForm(CTX, form({ lookup: '{"nope":1}' }), 'active');
    expect(r).toEqual({ ok: false, error: 'Choose a business from the results first.' });
    expect(m.runTool).not.toHaveBeenCalled();
  });

  it('a logo is normalised first (a bad one stops before creating) and uploaded after', async () => {
    m.normalizeLogo.mockResolvedValueOnce({ error: 'unsupported_type' });
    const bad = await createClientFromForm(CTX, form({ locality: '78681', logo: new File(['x'], 'l.txt', { type: 'text/plain' }) }), 'active');
    expect(bad).toEqual({ ok: false, error: 'Use a PNG, JPEG, WebP or SVG file.' });
    expect(m.runTool).not.toHaveBeenCalled();

    m.normalizeLogo.mockResolvedValueOnce({ png: new Uint8Array([1, 2, 3]), sha256: 'a'.repeat(64) });
    await expect(createClientFromForm(CTX, form({ locality: '78681', logo: new File(['x'], 'l.png', { type: 'image/png' }) }), 'active')).rejects.toThrow('NEXT_REDIRECT:/c/c1/setup');
    expect(m.runTool.mock.calls.map((c) => c[1])).toEqual(['create_client', 'upload_client_logo']);
    expect(m.runTool.mock.calls[1]![2]).toEqual({ clientId: 'c1', png: 'AQID', sha256: 'a'.repeat(64) });
  });

  it('a failed logo upload does not undo the client: setup still opens', async () => {
    m.normalizeLogo.mockResolvedValueOnce({ png: new Uint8Array([1]), sha256: 'b'.repeat(64) });
    m.runTool.mockResolvedValueOnce({ ok: true, data: { clientId: 'c1' } }).mockResolvedValueOnce({ ok: false, error: 'Logo storage is not configured' });
    await expect(createClientFromForm(CTX, form({ locality: '78681', logo: new File(['x'], 'l.png', { type: 'image/png' }) }), 'active')).rejects.toThrow('NEXT_REDIRECT:/c/c1/setup');
  });

  it('hands a tool refusal back to the form', async () => {
    m.runTool.mockResolvedValueOnce({ ok: false, error: 'Enter a US phone number, like (404) 555-0100' });
    expect(await createClientFromForm(CTX, form({ locality: '78681', phone: '12' }), 'active')).toEqual({ ok: false, error: 'Enter a US phone number, like (404) 555-0100' });
  });
});
