import { toolkit, ToolError } from '@cs/core';
import { z } from 'zod';
import type { ToolDeps } from '../deps';
import { fetchItem, parseItemId } from '../search/fetch-item';

const { defineTool } = toolkit<ToolDeps>();

export const fetchTool = defineTool({
  name: 'fetch',
  description: 'Fetch one item by the id search returned (<type>:<id>; types event, evidence, brief, brief_item, recommendation, alert, review, page): its full text, link and evidence ids.',
  // Any string up to 80 characters: a malformed id is `not_found` exactly like a hidden one (never `invalid_input`).
  input: z.object({ id: z.string().min(1).max(80) }),
  output: z.object({
    id: z.string(), title: z.string(), text: z.string(), url: z.string(),
    metadata: z.object({ type: z.string(), client_id: z.string(), evidence_ids: z.array(z.string()), occurred_at: z.string().optional() }),
  }),
  permission: 'read',
  channels: ['web', 'mcp', 'ask'],
  async handler(ctx, { id }, deps) {
    const parsed = parseItemId(id);
    if (!parsed) throw new ToolError('not_found', 'Not found');
    const { screenshotKey: _key, ...out } = await fetchItem(deps, ctx, parsed.type, parsed.uuid);
    return out;
  },
});

export const fetchTools = [fetchTool];
