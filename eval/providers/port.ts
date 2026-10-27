export interface CompletionRequest {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  schema: Record<string, unknown>;
  model: string;
  maxOutputTokens: number;
}
export interface Completion {
  value: unknown;
  usage: { inputTokens: number | null; outputTokens: number | null };
  modelReturned: string;
  latencyMs: number;
}
export interface Provider { complete(request: CompletionRequest): Promise<Completion> }
export function parseResponse(text: string): unknown {
  // No fence removal, repair, follow-up request or silent coercion.
  return JSON.parse(text) as unknown;
}
export function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
