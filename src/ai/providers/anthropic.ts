import type { ChatRequest, HttpRequest, ParsedResponse, ProviderAdapter } from '../types';

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

/** Messages API de Anthropic (Claude). */
export class AnthropicAdapter implements ProviderAdapter {
  readonly name = 'anthropic' as const;

  constructor(
    private readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = 'https://api.anthropic.com',
  ) {}

  buildRequest(request: ChatRequest, { includeTemperature }: { includeTemperature: boolean }): HttpRequest {
    // La Messages API no tiene un "modo JSON": el formato se exige en el prompt y el cliente extrae el objeto.
    const schema = request.jsonSchema ? `\nEl objeto debe cumplir este JSON Schema:\n${JSON.stringify(request.jsonSchema)}` : '';
    const system = request.json
      ? `${request.system}\n\nResponde únicamente con un objeto JSON válido, sin texto adicional ni bloques de código.${schema}`
      : request.system;
    return {
      url: `${this.baseUrl.replace(/\/$/, '')}/v1/messages`,
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: {
        model: this.model,
        max_tokens: request.maxTokens ?? 1024,
        system,
        messages: [{ role: 'user', content: request.user }],
        ...(includeTemperature && request.temperature !== undefined ? { temperature: request.temperature } : {}),
      },
    };
  }

  parseResponse(body: unknown): ParsedResponse {
    const response = body as AnthropicResponse;
    const text = (response.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('');
    return {
      text,
      usage: { inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens },
    };
  }
}
