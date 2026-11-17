import { DEFAULT_VOICE, type VoiceSettings } from '@cs/core';
import type { Db } from '@cs/db';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { fixtureVoicePreview, voicePreviewFor } = await import('./voice-preview');

const db = {} as Db;
const voice: VoiceSettings = { tone: 'formal', preferredTerms: [{ say: 'visit', insteadOf: 'call-out' }], bannedTerms: [] };
const scope = { agencyId: 'a1', clientId: null };

describe('voicePreviewFor', () => {
  it('fixture is deterministic, names the tone and uses one preferred term', async () => {
    const a = await fixtureVoicePreview(voice, scope);
    expect(a).toBe(await fixtureVoicePreview(voice, scope));
    expect(a).toContain('Sample alert in a formal voice');
    expect(a).toContain('"visit"');
    expect(await fixtureVoicePreview(DEFAULT_VOICE, scope)).toContain('friendly voice');
  });

  it('fixture under fake lookup, demo and test; absent without a key', () => {
    expect(voicePreviewFor('dev', db, { fake: true, processEnv: { NODE_ENV: 'test' } })).toBe(fixtureVoicePreview);
    expect(voicePreviewFor('demo', db, { fake: false, processEnv: { NODE_ENV: 'test' } })).toBe(fixtureVoicePreview);
    expect(voicePreviewFor('test', db, { fake: false, processEnv: { NODE_ENV: 'test' } })).toBe(fixtureVoicePreview);
    expect(voicePreviewFor('dev', db, { fake: false, processEnv: { NODE_ENV: 'test' } })).toBeUndefined();
    expect(voicePreviewFor('dev', db, { fake: false, processEnv: { NODE_ENV: 'test', OPENROUTER_API_KEY: 'k' } })).toBeTypeOf('function');
  });
});
