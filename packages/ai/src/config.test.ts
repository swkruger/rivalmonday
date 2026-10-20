import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG_PATH, REQUEST_PATH_BUDGET_MS, loadAiConfigFile, parseAiConfig, timingOf } from './config';

const yaml = (...lines: string[]) => ['tasks:', ...lines].join('\n');

describe('parseAiConfig', () => {
  it('applies defaults', () => {
    const cfg = parseAiConfig(`
tasks:
  brief_writer: { provider: openrouter, model: anthropic/claude-sonnet-5 }
  decisions: { provider: jev }
`);
    expect(cfg.openrouter).toEqual({ data_collection: 'deny', zdr: true, app_name: 'CompetitorSpy' });
    expect(cfg.jev).toEqual({ input_usd_per_mtok: 0.042 });
    expect(cfg.tasks.brief_writer).toMatchObject({ provider: 'openrouter', mode: 'chat', fallbacks: [] });
    expect(cfg.tasks.decisions).toMatchObject({ provider: 'jev', model: 'jev-latest', min_confidence: { default: 0.85 } });
  });

  it('rejects escalate_to pointing at a missing or non-decision task', () => {
    expect(() => parseAiConfig(`
tasks:
  decisions: { provider: jev, escalate_to: nope }
`)).toThrow(/escalate_to/);
    expect(() => parseAiConfig(`
tasks:
  brief_writer: { provider: openrouter, model: m }
  decisions: { provider: jev, escalate_to: brief_writer }
`)).toThrow(/escalate_to/);
  });

  it('requires an embeddings task to set dimensions', () => {
    expect(() => parseAiConfig('tasks:\n  embeddings: { provider: openrouter, model: e/small, mode: embeddings }')).toThrow(/dimensions/);
    expect(parseAiConfig('tasks:\n  embeddings: { provider: openrouter, model: e/small, mode: embeddings, dimensions: 512 }').tasks.embeddings).toMatchObject({ dimensions: 512 });
  });

  it('rejects unknown providers and bad thresholds', () => {
    expect(() => parseAiConfig('tasks:\n  x: { provider: magic, model: m }')).toThrow();
    expect(() => parseAiConfig('tasks:\n  d: { provider: jev, min_confidence: { default: 1.5 } }')).toThrow();
  });

  it('loads the shipped default config', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    for (const task of ['brief_writer', 'ask_assistant', 'value_extract', 'theme_discovery', 'llm_decisions', 'review_decisions', 'price_decisions', 'setup_suggestions', 'runbook_tailor']) {
      expect(cfg.tasks[task]).toBeDefined();
    }
    expect(cfg.tasks.embeddings).toMatchObject({ provider: 'openrouter', mode: 'embeddings', model: 'openai/text-embedding-3-small', dimensions: 512 });
    expect(cfg.tasks.setup_suggestions).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6', fallbacks: ['anthropic/claude-haiku-4.5'], temperature: 0.2, max_tokens: 800 });
  });

  it('config loads lead_preview_summary', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    expect(cfg.tasks.lead_preview_summary).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-haiku-4.5', temperature: 0.3, max_tokens: 300 });
  });

  it('config loads ask_assistant, ask_starters, ask_guard_decisions', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    expect(cfg.tasks.ask_assistant).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5', fallbacks: ['anthropic/claude-sonnet-4.6'], max_tokens: 6000 });
    // sonnet-5 rejects temperature on every endpoint; with require_parameters that silently routed every turn to the fallback.
    expect(cfg.tasks.ask_assistant).not.toHaveProperty('temperature');
    expect(cfg.tasks.ask_starters).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-haiku-4.5', temperature: 0.5, max_tokens: 400 });
    expect(cfg.tasks.ask_guard_decisions).toMatchObject({ provider: 'jev', escalate_to: 'llm_decisions', min_confidence: { default: 0.85 }, shadow_rate: 0.05 });
    // Owner decision 2026-10-13: hedged interpretation lines need only a clear yes (p >= 0.6); cited facts stay on verifier_decisions (0.85).
    expect(cfg.tasks.ask_interpretation_decisions).toMatchObject({ provider: 'jev', escalate_to: 'llm_decisions', min_confidence: { default: 0.2 } });
  });

  it('gives every decision use its own Jev task escalating to llm_decisions, and no shared "decisions" task (Phase 3d)', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    for (const name of ['tag_decisions', 'structured_decisions', 'merge_decisions', 'page_decisions', 'review_decisions', 'price_decisions']) {
      const t = cfg.tasks[name];
      expect(t?.provider, name).toBe('jev');
      if (t?.provider === 'jev') expect(t.escalate_to, name).toBe('llm_decisions');
    }
    expect(cfg.tasks.decisions).toBeUndefined();
  });

  it('accepts an anthropic batch task and ships theme_discovery_batch (Phase 3d)', async () => {
    const t = parseAiConfig('tasks:\n  b: { provider: anthropic, model: claude-sonnet-5, mode: batch, input_usd_per_mtok: 1, output_usd_per_mtok: 5 }').tasks.b;
    expect(t).toMatchObject({ provider: 'anthropic', mode: 'batch', max_tokens: 8000 });
    expect(() => parseAiConfig('tasks:\n  b: { provider: anthropic, model: m, mode: batch }')).toThrow();
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    expect(cfg.tasks.theme_discovery_batch).toMatchObject({ provider: 'anthropic', model: 'claude-sonnet-5', mode: 'batch' });
  });

  it('defaults timeout 60000 / attempts 3 / request_path false', () => {
    const cfg = parseAiConfig(['tasks:', '  w: { provider: openrouter, model: m/x }', '  j: { provider: jev }'].join('\n'));
    expect(cfg.tasks.w).toMatchObject({ timeout_ms: 60_000, max_attempts: 3, request_path: false });
    expect(cfg.tasks.j).toMatchObject({ timeout_ms: 60_000, max_attempts: 3, request_path: false });
    expect(timingOf(cfg.tasks.w!)).toEqual({ timeoutMs: 60_000, maxAttempts: 3 });
  });

  it('rejects max_attempts 4', () => {
    expect(() => parseAiConfig(yaml('  w: { provider: openrouter, model: m/x, max_attempts: 4 }'))).toThrow();
  });

  it('rejects a request_path task over budget', () => {
    expect(REQUEST_PATH_BUDGET_MS).toBe(45_000);
    expect(() => parseAiConfig(yaml('  w: { provider: openrouter, model: m/x, request_path: true, timeout_ms: 20000, max_attempts: 3 }'))).toThrow(/45000/);
    expect(() => parseAiConfig(yaml('  w: { provider: openrouter, model: m/x, request_path: true, timeout_ms: 22500, max_attempts: 2 }'))).not.toThrow();
  });

  it('rejects a request_path jev task whose two stages exceed 45 s', () => {
    const llm = '  l: { provider: openrouter, model: m/x, mode: decisions }';
    const jev = (t: number, n: number) => yaml(llm, `  j: { provider: jev, escalate_to: l, request_path: true, timeout_ms: ${t}, max_attempts: ${n} }`);
    expect(() => parseAiConfig(jev(15000, 2))).toThrow(/45000/);
    expect(() => parseAiConfig(jev(10000, 2))).not.toThrow();
    // without escalate_to a single stage applies
    expect(() => parseAiConfig(yaml('  j: { provider: jev, request_path: true, timeout_ms: 15000, max_attempts: 3 }'))).not.toThrow();
  });

  it('bundled ai.yaml: ask_assistant, ask_guard_decisions, ask_interpretation_decisions, verifier_decisions, embeddings, vertical_draft, runbook_retailor are request_path and fit', async () => {
    const cfg = await loadAiConfigFile(DEFAULT_AI_CONFIG_PATH);
    for (const name of ['ask_assistant', 'ask_guard_decisions', 'ask_interpretation_decisions', 'verifier_decisions', 'embeddings', 'vertical_draft', 'runbook_retailor']) {
      const t = cfg.tasks[name]!;
      expect(t.request_path, name).toBe(true);
      const stages = t.provider === 'jev' && t.escalate_to ? 2 : 1;
      expect(stages * t.timeout_ms * t.max_attempts, name).toBeLessThanOrEqual(REQUEST_PATH_BUDGET_MS);
    }
    const tailor = cfg.tasks.runbook_tailor;
    expect(tailor).toMatchObject({ request_path: false, max_tokens: 4000 });
    expect(cfg.tasks.runbook_retailor).toMatchObject({ model: (tailor as { model: string }).model, max_tokens: 1000 });
  });
});
