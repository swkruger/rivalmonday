import { type AccessContext, type CallOptions, isAgencyRole, ToolError, type ToolRegistry } from '@cs/core';
import type { Db } from '@cs/db';
import { assertAgencyServiceable, fetchItem, type ToolDeps } from '@cs/tools';
import { type McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { RateLimitedError, toResourceError } from './errors';
import { checkRateLimit } from './rate-limit';

/** Everything a request needs to act as the token's caller. */
export interface McpSession {
  ctx: AccessContext;
  opts: CallOptions;
  tokenKey: string;
  registry: ToolRegistry<ToolDeps>;
  deps: ToolDeps;
  service: Db;
}

/** P17: `tools/call` and `resources/read` each count against the token's windows. */
export async function enforceRateLimit(s: McpSession): Promise<void> {
  const r = await checkRateLimit(s.service, s.tokenKey);
  if (!r.ok) throw new RateLimitedError(r.retryAfterS);
}

/** I7: a paused (`read_only`/`suspended`) agency's data is not served, here as on `tools/call` (role-aware copy). */
async function guard(s: McpSession, tool: string): Promise<void> {
  await enforceRateLimit(s);
  await assertAgencyServiceable(s.service, s.ctx);
  requireTool(s, tool);
}

/** A resource is readable only when its tool is visible to this ctx + token scope (same 404 as a missing item). */
function requireTool(s: McpSession, name: string): void {
  if (!s.registry.list(s.ctx, s.opts).some((t) => t.name === name)) throw new ToolError('not_found', 'Not found');
}

const idOf = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v.length === 1 ? v[0]! : '') : (v ?? ''));

interface BriefView { items: { ord: number; status: string; upsellTag: string | null }[] }

/**
 * Agency roles only: an `Upsell: <tag>` line after each item that has one. `fetchItem`'s brief text is the summary
 * followed by one `## ` section per active item in `ord` order, which is matched to `get_brief`'s items in the same
 * order; if the sections can't be matched one-to-one the tags are listed at the end instead.
 */
function withUpsell(text: string, tags: (string | null)[]): string {
  if (!tags.some((t) => t)) return text;
  const sections = text.split(/\n\n(?=## )/);
  const offset = sections.length - tags.length;
  if (offset === 0 || (offset === 1 && !sections[0]!.startsWith('## '))) {
    tags.forEach((tag, i) => {
      if (tag) sections[offset + i] += `\nUpsell: ${tag}`;
    });
    return sections.join('\n\n');
  }
  return `${text}\n\n${tags.map((t, i) => (t ? `Upsell (item ${i + 1}): ${t}` : null)).filter(Boolean).join('\n')}`;
}

export function registerResources(server: McpServer, s: McpSession): void {
  server.registerResource('evidence', new ResourceTemplate('evidence://{id}', { list: undefined }), {
    description: 'One piece of evidence (redacted page text, or a screenshot with its description).', mimeType: 'text/plain',
  }, async (uri, vars): Promise<ReadResourceResult> => {
    try {
      await guard(s, 'get_evidence');
      const item = await fetchItem(s.deps, s.ctx, 'evidence', idOf(vars.id));
      const contents: ReadResourceResult['contents'] = [{ uri: uri.href, mimeType: 'text/plain', text: item.text }];
      if (item.screenshotKey && s.deps.evidenceStore) {
        const bytes = await s.deps.evidenceStore.get(item.screenshotKey);
        if (bytes) contents.push({ uri: uri.href, mimeType: 'image/webp', blob: Buffer.from(bytes).toString('base64') });
      }
      return { contents };
    } catch (e) {
      throw toResourceError(e, 'evidence');
    }
  });

  server.registerResource('brief', new ResourceTemplate('brief://{id}', { list: undefined }), {
    description: 'One weekly brief as markdown, items in order.', mimeType: 'text/markdown',
  }, async (uri, vars): Promise<ReadResourceResult> => {
    try {
      await guard(s, 'get_brief');
      const id = idOf(vars.id);
      const item = await fetchItem(s.deps, s.ctx, 'brief', id); // visibility, client status, redaction, upsell stripped
      let body = item.text;
      if (isAgencyRole(s.ctx.role)) {
        // upsell_tag is agency-only (spec 8.5): read through the registry's agency view of the same brief.
        const view = (await s.registry.invoke(s.ctx, 'get_brief', { briefId: id }, s.opts)) as BriefView;
        const active = view.items.filter((i) => i.status === 'active').sort((a, b) => a.ord - b.ord);
        body = withUpsell(body, active.map((i) => i.upsellTag));
      }
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text: `# ${item.title}\n\n${body}` }] };
    } catch (e) {
      throw toResourceError(e, 'brief');
    }
  });
}
