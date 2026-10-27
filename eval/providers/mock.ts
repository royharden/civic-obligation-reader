import type { Completion, CompletionRequest, Provider } from './port';
export class MockProvider implements Provider {
  calls: CompletionRequest[] = [];
  private response: Completion;
  constructor(response: Completion) { this.response = response; }
  async complete(request: CompletionRequest): Promise<Completion> {
    this.calls.push(structuredClone(request));
    return structuredClone(this.response);
  }
}
