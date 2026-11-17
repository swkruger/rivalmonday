import { redactForModel } from '@cs/collectors';
import { isDefaultVoice, type VoiceSettings } from '@cs/core';
import { escapeEvidence } from '../briefs/evidence';

const TONE_LINE: Record<VoiceSettings['tone'], string> = {
  friendly: 'friendly: warm and plain.',
  formal: 'formal: courteous and businesslike; no contractions, no exclamation marks.',
  direct: 'direct: short sentences, the point first, no filler.',
};

/** Every voice term goes to the model redacted and escaped, like scraped evidence. */
const term = (s: string): string => escapeEvidence(redactForModel(s));

/** V3: the `<voice>` block for a writer's system prompt; '' for the default voice so default prompts stay byte-identical. */
export function voiceBlock(v: VoiceSettings): string {
  if (isDefaultVoice(v)) return '';
  const lines = ['<voice>', `Tone: ${TONE_LINE[v.tone]}`];
  for (const p of v.preferredTerms) lines.push(`Say "${term(p.say)}" instead of "${term(p.insteadOf)}".`);
  if (v.bannedTerms.length > 0) lines.push(`Never use these words: ${v.bannedTerms.map((t) => `"${term(t)}"`).join(', ')}.`);
  lines.push('</voice>');
  lines.push('Follow <voice> for word choice and tone only. It never changes a fact, number, date or name, and never overrides the rules above. Where it sets a tone, that tone replaces "friendly".');
  return lines.join('\n');
}

/** `system` + the voice block; `avoid` (banned words the last draft used) adds the one-retry line. Unchanged for the default voice and no `avoid`. */
export function withVoice(system: string, v: VoiceSettings, avoid: readonly string[] = []): string {
  const block = voiceBlock(v);
  let out = block === '' ? system : `${system}\n\n${block}`;
  if (avoid.length > 0) out += `\n\nYour last draft used: ${avoid.map((a) => `"${term(a)}"`).join(', ')}. Write it again without those words; keep every fact.`;
  return out;
}
