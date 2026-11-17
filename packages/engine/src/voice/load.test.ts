import { runbook, runbookItem } from '@cs/db';
import { IDS, openTestDbs, seedTenancy, truncateAll } from '@cs/db/test-helpers';
import { DEFAULT_VOICE, type VoiceSettings } from '@cs/core';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunbookItem } from '../runbook/items';
import { loadVoice, VOICE_KEY, voiceOfItems } from './load';

const formal: VoiceSettings = { tone: 'formal', preferredTerms: [], bannedTerms: ['cheap'] };
const direct: VoiceSettings = { tone: 'direct', preferredTerms: [{ say: 'repair', insteadOf: 'fix' }], bannedTerms: [] };
const item = (content: unknown, o: Partial<RunbookItem> = {}): RunbookItem => ({
  key: VOICE_KEY, kind: 'knob', content, enabled: true, businessAreaIds: null, version: 1,
  upstreamVersion: null, upstreamSnapshot: null, dismissedUpstreamVersion: null, customised: false, removedUpstream: false, ...o,
});

describe('voiceOfItems', () => {
  it('customised enabled client knob wins', () => {
    expect(voiceOfItems([item(direct, { customised: true })], [item(formal)])).toEqual(direct);
  });
  it('non-customised client copy follows the agency', () => {
    expect(voiceOfItems([item(direct)], [item(formal)])).toEqual(formal);
  });
  it('disabled client knob → agency', () => {
    expect(voiceOfItems([item(direct, { customised: true, enabled: false })], [item(formal)])).toEqual(formal);
  });
  it('agency has no knob + client has a non-customised enabled copy → DEFAULT_VOICE', () => {
    expect(voiceOfItems([item(direct)], null)).toEqual(DEFAULT_VOICE);
    expect(voiceOfItems([item(direct)], [])).toEqual(DEFAULT_VOICE);
  });
  it('no knobs → DEFAULT_VOICE', () => {
    expect(voiceOfItems(null, null)).toEqual(DEFAULT_VOICE);
    expect(voiceOfItems([], [])).toEqual(DEFAULT_VOICE);
  });
  it('invalid content skipped', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(voiceOfItems([item({ tone: 'loud' }, { customised: true })], [item(formal)])).toEqual(formal);
    expect(voiceOfItems(null, [item({ nope: 1 })])).toEqual(DEFAULT_VOICE);
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe('loadVoice', () => {
  const dbs = openTestDbs();
  afterAll(() => dbs.closeAll());
  beforeEach(async () => {
    await truncateAll(dbs.owner);
    await seedTenancy(dbs.owner);
    await dbs.owner.delete(runbook);
  });

  it('legacy client (no client runbook) → agency knob', async () => {
    const [rb] = await dbs.owner.insert(runbook).values({ level: 'agency', agencyId: IDS.agencyA }).returning({ id: runbook.id });
    await dbs.owner.insert(runbookItem).values({ runbookId: rb!.id, itemKey: VOICE_KEY, kind: 'knob', content: formal, enabled: true, updatedBy: 'test' });
    expect(await loadVoice(dbs.service, IDS.clientA1)).toEqual(formal);
  });

  it('no runbooks → DEFAULT_VOICE; unknown client throws', async () => {
    expect(await loadVoice(dbs.service, IDS.clientA1)).toEqual(DEFAULT_VOICE);
    await expect(loadVoice(dbs.service, '00000000-0000-4000-8000-000000000000')).rejects.toThrow(/Unknown client/);
  });

  it('customised client knob wins over the agency knob', async () => {
    const [a] = await dbs.owner.insert(runbook).values({ level: 'agency', agencyId: IDS.agencyA }).returning({ id: runbook.id });
    const [c] = await dbs.owner.insert(runbook).values({ level: 'client', agencyId: IDS.agencyA, clientId: IDS.clientA1 }).returning({ id: runbook.id });
    await dbs.owner.insert(runbookItem).values([
      { runbookId: a!.id, itemKey: VOICE_KEY, kind: 'knob', content: formal, enabled: true, updatedBy: 'test' },
      { runbookId: c!.id, itemKey: VOICE_KEY, kind: 'knob', content: direct, enabled: true, customised: true, updatedBy: 'test' },
    ]);
    expect(await loadVoice(dbs.service, IDS.clientA1)).toEqual(direct);
  });
});
