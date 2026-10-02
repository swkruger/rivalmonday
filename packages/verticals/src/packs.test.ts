import { MOVE_TYPES } from '@cs/core';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKS_DIR, listVerticalPacks, loadVerticalPack } from './loader';

describe('pilot vertical packs', () => {
  it('ships exactly the pilot packs', async () => {
    expect(await listVerticalPacks()).toEqual(['dental', 'hvac_plumbing']);
  });

  it.each(['hvac_plumbing', 'dental'])('%s loads with a playbook for every move type', async (id) => {
    const pack = await loadVerticalPack(id);
    expect(pack.services.length).toBeGreaterThanOrEqual(10);
    expect(pack.themes.length).toBeGreaterThanOrEqual(6);
    expect(pack.type_weights.cosmetic).toBe(0);
    const triggers = new Set(pack.playbooks.map((p) => p.trigger));
    for (const move of MOVE_TYPES) expect(triggers).toContain(move);
    expect(pack.scoring.routing).toEqual({ alert: 70, brief: 40 });
    expect(pack.scoring.size.price_pct_for_full).toBeGreaterThan(0);
  });

  it('rejects unknown ids and mismatched declared ids', async () => {
    await expect(loadVerticalPack('../etc/passwd')).rejects.toThrow(/invalid vertical id/i);
    const dir = await mkdtemp(join(tmpdir(), 'packs-'));
    await writeFile(join(dir, 'other.yaml'), await readFile(join(PACKS_DIR, 'dental.yaml'), 'utf8'));
    await expect(loadVerticalPack('other', dir)).rejects.toThrow(/declares id "dental"/);
  });
});
