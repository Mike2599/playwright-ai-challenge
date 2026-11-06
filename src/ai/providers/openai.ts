import type { ChatRequest, HttpRequest, ParsedResponse, ProviderAdapter } from '../types';

interface OpenAIResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** Chat Completions de OpenAI (también sirve para cualquier API compatible vía AI_BASE_URL). */
export class OpenAIAdapter implements ProviderAdapter {
  readonly name = 'openai' as const;

  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.openai.com/v1',
  ) {}

  buildRequest(request: ChatRequest, { includeTemperature }: { includeTemperature: boolean }): HttpRequest {
    // El modo json_object garantiza JSON válido; el esquema se indica en el prompt.
    const schema = request.jsonSchema ? `\n\nResponde con un objeto JSON que cumpla este JSON Schema:\n${JSON.stringify(request.jsonSchema)}` : '';
    return {
      url: `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
      body: {
        model: this.model,
        messages: [
          { role: 'system', content: request.system + schema },
          { role: 'user', content: request.user },
        ],
        ...(includeTemperature && request.temperature !== undefined ? { temperature: request.temperature } : {}),
        ...(request.json ? { response_format: { type: 'json_object' } } : {}),
      },
    };
  }

  parseResponse(body: unknown): ParsedResponse {
    const response = body as OpenAIResponse;
    return {
      text: response.choices?.[0]?.message?.content ?? '',
      usage: { inputTokens: response.usage?.prompt_tokens, outputTokens: response.usage?.completion_tokens },
    };
  }
}
