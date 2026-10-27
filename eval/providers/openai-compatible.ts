import { parseResponse, tokenCount } from './port';
import type { Completion, CompletionRequest, Provider } from './port';
export class OpenAICompatibleProvider implements Provider {
  async complete(request: CompletionRequest): Promise<Completion> {
    const key = process.env.OPENAI_API_KEY;
    const base = process.env.MODEL_BASE_URL;
    if (!key || !base) throw new Error('not_run: missing owner-local provider access');
    const endpoint = new URL(base);
    if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('invalid provider endpoint');
    const started = Date.now();
    const response = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(60_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: request.model, messages: request.messages, max_tokens: request.maxOutputTokens,
        // Compatibility endpoints differ in strict-schema support. Local parsing/validation is authoritative.
        response_format: { type: 'json_schema', json_schema: { name: 's46_response', schema: request.schema } } }),
    });
    if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
    const body = await response.json() as { model?: unknown; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: unknown; completion_tokens?: unknown } };
    return { value: parseResponse(body.choices?.[0]?.message?.content ?? ''), modelReturned: typeof body.model === 'string' ? body.model : '',
      usage: { inputTokens: tokenCount(body.usage?.prompt_tokens), outputTokens: tokenCount(body.usage?.completion_tokens) }, latencyMs: Date.now() - started };
  }
}
