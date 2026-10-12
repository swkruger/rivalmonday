/** Writes the in-app Ask assistant may call in addition to every `mcp` read tool (Phase 6b decision Q4). */
export const ASK_WRITE_TOOLS = ['submit_feedback', 'update_recommendation_status', 'add_recommendation'] as const;

/** UI fallback when a client has no `ask_starter` row yet (spec "Starters (worker)"); re-exported by `@cs/ask`. */
export const GENERIC_STARTERS: readonly string[] = [
  'What changed at my competitors this week?',
  'Which competitor is most active this month?',
  "How do our reviews compare with competitors'?",
  'Have any competitors changed their prices recently?',
];
