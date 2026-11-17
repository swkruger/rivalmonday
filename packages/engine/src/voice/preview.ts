import type { Ai } from '@cs/ai';
import type { CallScope, VoiceSettings } from '@cs/core';
import { withVoice } from './block';

export const VOICE_PREVIEW_TASK = 'voice_preview';

/** Fixed demo evidence (V7): no client or competitor data ever reaches a preview. */
export const PREVIEW_EVIDENCE = [
  'Business: Sample Heating & Air (HVAC)',
  'Competitor: Example Comfort Co',
  'Kind: price change',
  'Evidence: Example Comfort Co lowered its furnace tune-up from $129 to $99 on its pricing page on 2026-03-10.',
].join('\n');

const SYSTEM = 'You write one short alert for a local business owner about a competitor change. Use only the facts in <evidence>. Write exactly two sentences: what changed, then one practical thing to do this week.';

/** V7: a two-sentence sample alert in the (unsaved) voice, from fixed demo evidence. */
export async function writeVoicePreview(ai: Ai, scope: CallScope, v: VoiceSettings): Promise<string> {
  const res = await ai.chat(
    VOICE_PREVIEW_TASK,
    { messages: [{ role: 'system', content: withVoice(SYSTEM, v) }, { role: 'user', content: `<evidence>\n${PREVIEW_EVIDENCE}\n</evidence>` }] },
    scope,
  );
  return res.text.trim();
}
