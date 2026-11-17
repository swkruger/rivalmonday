import { findBannedTerms, toolkit, ToolError, VoiceSettingsSchema } from '@cs/core';
import { llmCall } from '@cs/db';
import { VOICE_PREVIEW_TASK } from '@cs/engine';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { ToolDeps } from '../deps';

const { defineTool } = toolkit<ToolDeps>();

export const VOICE_PREVIEWS_PER_DAY = 10;
export const VOICE_PREVIEW_LIMIT_COPY = "You've used today's 10 voice previews. Try again tomorrow.";

const utcMidnight = (now = new Date()): Date => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** V7: a sample alert in the unsaved form voice. One paid call, so capped per agency per UTC day (R5); held agencies are refused by the write guard. */
export const previewVoice = defineTool({
  name: 'preview_voice',
  access: 'write', // one paid model call
  description: 'Write a two-sentence sample alert in a draft voice from fixed demo evidence. Nothing is saved. Up to 10 a day per agency.',
  input: z.object({ voice: VoiceSettingsSchema }),
  output: z.object({ text: z.string(), bannedTerms: z.array(z.string()) }),
  permission: 'agency',
  async handler(ctx, input, deps) {
    if (!deps.voicePreview) throw new ToolError('internal', 'Voice preview is not available right now.', { userFacing: true });
    const [row] = await deps.service
      .select({ n: sql<number>`count(*)::int` })
      .from(llmCall)
      .where(and(eq(llmCall.agencyId, ctx.agencyId), eq(llmCall.task, VOICE_PREVIEW_TASK), gte(llmCall.createdAt, utcMidnight())));
    if ((row?.n ?? 0) >= VOICE_PREVIEWS_PER_DAY) throw new ToolError('rate_limited', VOICE_PREVIEW_LIMIT_COPY, { userFacing: true });
    const text = await deps.voicePreview(input.voice, { agencyId: ctx.agencyId, clientId: null });
    return { text, bannedTerms: findBannedTerms(text, input.voice.bannedTerms) };
  },
});

export const voiceTools = [previewVoice];
