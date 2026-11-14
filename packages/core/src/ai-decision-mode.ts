/** Phase 18e (Track B): how Jev-primary decision tasks escalate. `platform_setting` key `ai_decision_mode`. */
export interface AiDecisionMode {
  mode: 'jev_only' | 'cascade';
  /** ISO timestamp: until then, Jev-primary calls also ask the LLM (re-evaluation window), within the daily call cap. */
  reevalUntil: string | null;
}
