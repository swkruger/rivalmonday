import { z } from 'zod';

export const TONES = ['friendly', 'formal', 'direct'] as const;
export type VoiceSettings = {
  tone: 'formal' | 'friendly' | 'direct';
  preferredTerms: { say: string; insteadOf: string }[]; // ≤ 20
  bannedTerms: string[]; // ≤ 20
};
export const VOICE_TERMS_MAX = 20;
export const VoiceTerm = z.string().trim().min(1).max(40).regex(/^[\p{L}\p{N} '\-]+$/u);
const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
export const VoiceSettingsSchema = z.strictObject({
  tone: z.enum(TONES),
  preferredTerms: z.array(z.strictObject({ say: VoiceTerm, insteadOf: VoiceTerm })).max(VOICE_TERMS_MAX),
  bannedTerms: z.array(VoiceTerm).max(VOICE_TERMS_MAX),
}).superRefine((v, ctx) => {
  const banned = v.bannedTerms.map(key);
  const dup = banned.find((t, i) => banned.indexOf(t) !== i);
  if (dup) ctx.addIssue({ code: 'custom', path: ['bannedTerms'], message: `duplicate: ${dup}` });
  const both = v.preferredTerms.find((p) => banned.includes(key(p.say)));
  if (both) ctx.addIssue({ code: 'custom', path: ['preferredTerms'], message: `both preferred and banned: ${both.say}` });
});
export const DEFAULT_VOICE: VoiceSettings = { tone: 'friendly', preferredTerms: [], bannedTerms: [] };
export const isDefaultVoice = (v: VoiceSettings) => v.tone === 'friendly' && v.preferredTerms.length === 0 && v.bannedTerms.length === 0;
/** Q2: whole-object override. */
export const effectiveVoice = (agency: VoiceSettings | null, override: VoiceSettings | null): VoiceSettings => override ?? agency ?? DEFAULT_VOICE;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The whole-word matcher for one term (case-insensitive; Unicode letters/digits are word characters), or null for a blank term. */
export function bannedTermRegex(term: string, flags = 'iu'): RegExp | null {
  const body = escapeRe(term.trim()).replace(/\s+/g, '\\s+');
  return body === '' ? null : new RegExp(`(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`, flags);
}
/** Case-insensitive, whole-word (Unicode letters/digits are word characters); the banned terms found, in list order. */
export function findBannedTerms(text: string, terms: readonly string[]): string[] {
  return terms.filter((t) => bannedTermRegex(t)?.test(text) === true);
}
/** V4: terms that occur inside a business or competitor name are not enforced for that text. */
export const enforcedTerms = (terms: readonly string[], names: readonly string[]): string[] =>
  terms.filter((t) => !names.some((n) => findBannedTerms(n, [t]).length > 0));
