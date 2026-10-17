import { describe, expect, it } from 'vitest';
import { DEFAULT_AI_CONFIG_PATH, loadAiConfigFile, parseAiConfig } from './config';

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
    for (const task of ['brief_writer', 'ask_assistant', 'value_extract', 'theme_discovery', 'llm_decisions', 'review_decisions', 'price_decisions', 'setup_suggestions']) {
      expect(cfg.tasks[task]).toBeDefined();
    }
    expect(cfg.tasks.embeddings).toMatchObject({ provider: 'openrouter', mode: 'embeddings', model: 'openai/text-embedding-3-small', dimensions: 512 });
    expect(cfg.tasks.setup_suggestions).toMatchObject({ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.6', fallbacks: ['anthropic/claude-haiku-4.5'], temperature: 0.2, max_tokens: 800 });
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
});
