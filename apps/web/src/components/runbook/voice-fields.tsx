'use client';
import { TONES, VOICE_TERMS_MAX, VoiceTerm, type VoiceSettings } from '@cs/core';
import { Button, Input, Label } from '@cs/ui';
import { X } from 'lucide-react';
import { useState } from 'react';

export const TONE_COPY: Record<VoiceSettings['tone'], { label: string; hint: string }> = {
  friendly: { label: 'Friendly', hint: 'Warm and plain.' },
  formal: { label: 'Formal', hint: 'Courteous and businesslike.' },
  direct: { label: 'Direct', hint: 'Short sentences, the point first.' },
};

export const TERM_CHARS_ERROR = 'Use letters, numbers, spaces, apostrophes or hyphens (up to 40 characters).';
export const TERM_MAX_ERROR = `Up to ${VOICE_TERMS_MAX} words.`;
const bothError = (t: string) => `“${t}” is both preferred and banned.`;
const twiceError = (t: string) => `“${t}” is listed twice.`;
const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The same rules as `VoiceSettingsSchema` (`@cs/core`), with the decided messages, so the form answers before the call. */
export function termProblem(term: string): string | null {
  return VoiceTerm.safeParse(term).success ? null : TERM_CHARS_ERROR;
}

/** Checks a word about to join the banned list. */
export function bannedProblem(term: string, v: VoiceSettings): string | null {
  const t = term.trim();
  const bad = termProblem(t);
  if (bad) return bad;
  if (v.bannedTerms.length >= VOICE_TERMS_MAX) return TERM_MAX_ERROR;
  if (v.bannedTerms.some((b) => key(b) === key(t))) return twiceError(t);
  if (v.preferredTerms.some((p) => key(p.say) === key(t))) return bothError(t);
  return null;
}

/** Whole-object check before Save / Preview; empty pairs are dropped. Returns the clean value or the first message. */
export function checkVoice(v: VoiceSettings): { ok: true; voice: VoiceSettings } | { ok: false; error: string } {
  const preferredTerms = v.preferredTerms.filter((p) => p.say.trim() !== '' || p.insteadOf.trim() !== '').map((p) => ({ say: p.say.trim(), insteadOf: p.insteadOf.trim() }));
  const bannedTerms = v.bannedTerms.map((t) => t.trim());
  if (preferredTerms.length > VOICE_TERMS_MAX || bannedTerms.length > VOICE_TERMS_MAX) return { ok: false, error: TERM_MAX_ERROR };
  for (const t of [...preferredTerms.flatMap((p) => [p.say, p.insteadOf]), ...bannedTerms]) {
    const bad = termProblem(t);
    if (bad) return { ok: false, error: bad };
  }
  const seen = new Set<string>();
  for (const t of bannedTerms) {
    if (seen.has(key(t))) return { ok: false, error: twiceError(t) };
    seen.add(key(t));
  }
  const both = preferredTerms.find((p) => seen.has(key(p.say)));
  if (both) return { ok: false, error: bothError(both.say) };
  const clean: VoiceSettings = { tone: v.tone, preferredTerms, bannedTerms };
  return { ok: true, voice: clean };
}

/** Controlled voice form fields: tone, preferred pairs and banned words. Problems go to `onProblem` (the section's always-mounted region). */
export function VoiceFields({ value, onChange, onProblem, disabled }: {
  value: VoiceSettings;
  onChange: (v: VoiceSettings) => void;
  onProblem: (message: string | null) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState('');
  const setPair = (i: number, patch: Partial<{ say: string; insteadOf: string }>) =>
    onChange({ ...value, preferredTerms: value.preferredTerms.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
  const addPair = () => {
    if (value.preferredTerms.length >= VOICE_TERMS_MAX) return onProblem(TERM_MAX_ERROR);
    onProblem(null);
    onChange({ ...value, preferredTerms: [...value.preferredTerms, { say: '', insteadOf: '' }] });
  };
  const addBanned = () => {
    const t = draft.trim();
    if (t === '') return;
    const problem = bannedProblem(t, value);
    if (problem) return onProblem(problem);
    onProblem(null);
    onChange({ ...value, bannedTerms: [...value.bannedTerms, t] });
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2" disabled={disabled}>
        <legend className="mb-1 text-sm font-semibold">Tone</legend>
        {TONES.map((t) => (
          <label key={t} className="flex items-start gap-2 text-sm">
            <input type="radio" name="voice-tone" className="mt-1" checked={value.tone === t} onChange={() => onChange({ ...value, tone: t })} />
            <span>
              <span className="font-medium">{TONE_COPY[t].label}</span>
              <span className="block text-muted-ink">{TONE_COPY[t].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-semibold">Preferred words</h4>
        <p className="text-sm text-muted-ink">Say … instead of …</p>
        {value.preferredTerms.map((p, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`voice-say-${i}`}>Say</Label>
              <Input id={`voice-say-${i}`} className="w-52" value={p.say} disabled={disabled} maxLength={40} onChange={(e) => setPair(i, { say: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`voice-instead-${i}`}>Instead of</Label>
              <Input id={`voice-instead-${i}`} className="w-52" value={p.insteadOf} disabled={disabled} maxLength={40} onChange={(e) => setPair(i, { insteadOf: e.target.value })} />
            </div>
            {!disabled && (
              <Button variant="ghost" onClick={() => onChange({ ...value, preferredTerms: value.preferredTerms.filter((_, j) => j !== i) })}>Remove</Button>
            )}
          </div>
        ))}
        {!disabled && <div><Button variant="outline" onClick={addPair}>Add a pair</Button></div>}
      </div>

      <div className="flex flex-col gap-2">
        {disabled ? <span className="text-sm font-medium">Banned words</span> : <Label htmlFor="voice-banned">Banned words</Label>}
        <p className="text-sm text-muted-ink">A brief or alert that still uses one waits for your review. Whole words only: banning “cheap” doesn’t catch “cheaper”.</p>
        {!disabled && (
          <div className="flex flex-wrap items-center gap-3">
            <Input
              id="voice-banned"
              className="w-64"
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addBanned();
                }
              }}
            />
            <Button variant="outline" onClick={addBanned}>Add</Button>
          </div>
        )}
        {value.bannedTerms.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {value.bannedTerms.map((t) => (
              <li key={t} className="inline-flex h-7 items-center gap-1 rounded-sm bg-chip-neutral-bg pl-2.5 pr-1 text-xs font-medium text-chip-neutral-text">
                {t}
                {!disabled && (
                  <button type="button" aria-label={`Remove ${t}`} className="inline-flex size-5 items-center justify-center rounded-xs hover:bg-line" onClick={() => onChange({ ...value, bannedTerms: value.bannedTerms.filter((b) => b !== t) })}>
                    <X className="size-3" aria-hidden />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
