import type { CallTiming } from './config';

export type ToolCall = { id: string; name: string; arguments: string };

export type ChatMessage =
  | { role: 'system'; content: string; cacheControl?: boolean }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export type ChatTool = { name: string; description: string; parameters: Record<string, unknown> };

export interface JsonSchemaFormat {
  name: string;
  schema: Record<string, unknown>;
}

export interface ChatRequest {
  model: string;
  fallbacks?: string[];
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: JsonSchemaFormat;
  tools?: ChatTool[];
  toolChoice?: 'auto' | 'none';
  /** Per-call timeout/attempts (from the task); absent = the provider's construction-time defaults. */
  timing?: CallTiming;
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** Prompt tokens served from the provider cache (0 when unreported). */
  cachedTokens: number;
  toolCalls: ToolCall[];
  finishReason: string | null;
}

export interface ChatProvider {
  readonly id: string;
  complete(req: ChatRequest): Promise<ChatResult>;
}
