export type DecisionQuestion =
  | { type: 'choice'; instructions: string; options: Record<string, string> }
  | { type: 'score'; instructions: string; levels: string[] }
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } };

export type DecisionAnswer =
  | { type: 'choice'; value: string; probabilities: Record<string, number>; confidence: number }
  | { type: 'score'; value: number; probabilities: Record<string, number>; confidence: number }
  | { type: 'noul'; value: boolean; probability: number; confidence: number };

export interface DecisionCall<K extends string> {
  answers: Record<K, DecisionAnswer>;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface DecisionProvider {
  readonly id: string;
  decide<K extends string>(state: unknown, questions: Record<K, DecisionQuestion>): Promise<DecisionCall<K>>;
}

export function validateQuestions(questions: Record<string, DecisionQuestion>): void {
  const keys = Object.keys(questions);
  if (keys.length === 0) throw new Error('At least one question is required');
  for (const [key, q] of Object.entries(questions)) {
    if (!q.instructions) throw new Error(`Question ${key}: instructions are required`);
    if (q.type === 'choice') {
      const n = Object.keys(q.options).length;
      if (n < 2 || n > 255) throw new Error(`Question ${key}: choice needs 2-255 options (got ${n})`);
    }
    if (q.type === 'score' && (q.levels.length < 2 || q.levels.length > 10)) {
      throw new Error(`Question ${key}: score needs 2-10 levels (got ${q.levels.length})`);
    }
  }
}

/** Maps a true-probability to a 0..1 confidence: 0.5 → 0, 0 or 1 → 1. */
export function noulConfidence(p: number): number {
  return Math.abs(p - 0.5) * 2;
}
