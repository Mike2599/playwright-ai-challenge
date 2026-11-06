import type { ChatRequest, HttpRequest, ParsedResponse, ProviderAdapter } from '../types';

interface OllamaResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/** API REST de Ollama (modelo local, sin API key). */
export class OllamaAdapter implements ProviderAdapter {
  readonly name = 'ollama' as const;

  constructor(
    private readonly model: string,
    private readonly baseUrl = 'http://localhost:11434',
  ) {}

  buildRequest(request: ChatRequest, { includeTemperature }: { includeTemperature: boolean }): HttpRequest {
    return {
      url: `${this.baseUrl.replace(/\/$/, '')}/api/chat`,
      headers: { 'content-type': 'application/json' },
      body: {
        model: this.model,
        stream: false,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.user },
        ],
        // Salida estructurada: con el JSON Schema el modelo no puede salirse del formato ni entrar en bucles.
        ...(request.json ? { format: request.jsonSchema ?? 'json' } : {}),
        options: {
          ...(includeTemperature && request.temperature !== undefined ? { temperature: request.temperature } : {}),
          num_predict: request.maxTokens ?? 1024,
          // Ventana de contexto suficiente para enviar el fragmento de DOM en el self-healing.
          num_ctx: 8192,
        },
      },
    };
  }

  parseResponse(body: unknown): ParsedResponse {
    const response = body as OllamaResponse;
    return {
      text: response.message?.content ?? '',
      usage: { inputTokens: response.prompt_eval_count, outputTokens: response.eval_count },
    };
  }
}
