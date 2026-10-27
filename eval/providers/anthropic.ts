import { parseResponse, tokenCount } from './port';
import type { Completion, CompletionRequest, Provider } from './port';
export class AnthropicProvider implements Provider {
  async complete(request: CompletionRequest): Promise<Completion> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('not_run: missing owner-local provider access');
    const started = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: AbortSignal.timeout(60_000), redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: request.model, max_tokens: request.maxOutputTokens,
        system: request.messages.filter(m => m.role === 'system').map(m => m.content).join('\n') +
          '\nReturn exactly one JSON object matching: ' + JSON.stringify(request.schema),
        messages: request.messages.filter(m => m.role !== 'system') }),
    });
    if (!response.ok) throw new Error(`provider HTTP ${response.status}`);
    const body = await response.json() as { model?: unknown; content?: { type?: string; text?: string }[]; usage?: { input_tokens?: unknown; output_tokens?: unknown } };
    const text = body.content?.filter(c => c.type === 'text').map(c => c.text ?? '').join('') ?? '';
    return { value: parseResponse(text), modelReturned: typeof body.model === 'string' ? body.model : '',
      usage: { inputTokens: tokenCount(body.usage?.input_tokens), outputTokens: tokenCount(body.usage?.output_tokens) }, latencyMs: Date.now() - started };
  }
}
