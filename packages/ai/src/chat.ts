export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

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
}

export interface ChatResult {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface ChatProvider {
  readonly id: string;
  complete(req: ChatRequest): Promise<ChatResult>;
}
