import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GetPromptResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const user = (text: string): GetPromptResult => ({ messages: [{ role: 'user', content: { type: 'text', text } }] });
const clientOf = (id: string | undefined): string => (id ? `client ${id}` : 'this client');

/** The four templated prompts (copy decided in the plan); arguments are validated by the SDK against these zod shapes. */
export function registerPrompts(server: McpServer): void {
  server.registerPrompt('weekly_review', {
    description: "Review this week's competitor activity and what to do next.",
    argsSchema: { client_id: z.string().uuid().optional().describe('The client to review (optional for client tokens).') },
  }, ({ client_id }) => user(
    `Review this week's competitor activity for ${clientOf(client_id)}. Use \`list_briefs\` and \`get_brief\` for the latest brief, \`search_events\` (route flagged, days 7) for anything newer, and \`list_recommendations\` for open actions. Summarise the three most important changes with their evidence ids, then list what to do next. Say plainly when there is no evidence for a point.`,
  ));

  server.registerPrompt('competitor_deep_dive', {
    description: 'A deep dive on one competitor: pricing, advertising, reputation and recent moves.',
    argsSchema: { competitor_id: z.string().uuid().describe('The competitor to analyse.') },
  }, ({ competitor_id }) => user(
    `Give me a deep dive on competitor ${competitor_id}. Use \`get_competitor_profile\` and \`get_competitor_timeline\`, then \`get_price_history\`, \`list_ads\` and \`search_reviews\` for that competitor. Cover pricing, advertising, reputation and recent moves, cite evidence ids for every claim, and end with two or three ways we could respond.`,
  ));

  server.registerPrompt('respond_to_price_change', {
    description: "Confirm a competitor's price change and suggest a response.",
    argsSchema: { event_id: z.string().uuid().describe('The price-change event.') },
  }, ({ event_id }) => user(
    `A competitor changed a price (event ${event_id}). Use \`get_event\` and \`compare_snapshots\` to confirm exactly what changed, \`get_price_matrix\` to compare with our prices, and \`list_recommendations\` to avoid duplicates. Suggest a response — matching is rarely best; consider bundles, guarantees or service speed — and cite the evidence ids.`,
  ));

  server.registerPrompt('prepare_client_meeting', {
    description: 'A one-page agenda for a client meeting.',
    argsSchema: { client_id: z.string().uuid().optional().describe('The client to meet (optional for client tokens).') },
  }, ({ client_id }) => user(
    `Help me prepare for a meeting with ${clientOf(client_id)}. Use \`get_client_profile\`, \`list_briefs\`/\`get_brief\` for the last four weeks, \`list_alerts\`, \`list_moves\` and \`list_recommendations\`. Produce a one-page agenda: wins, threats with evidence ids, open recommendations and their status, and questions to ask.`,
  ));
}
