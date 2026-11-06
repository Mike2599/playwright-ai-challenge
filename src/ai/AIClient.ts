import { z } from 'zod';
import { AnthropicAdapter } from './providers/anthropic';
import { OllamaAdapter } from './providers/ollama';
import { OpenAIAdapter } from './providers/openai';
import type {
  AIConfig,
  AIExchange,
  AIExchangeListener,
  ChatRequest,
  HttpRequest,
  ProviderAdapter,
  TokenUsage,
} from './types';

export class AIProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AIProviderError';
  }
}

export class AIResponseFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIResponseFormatError';
  }
}

export interface AICompletion {
  text: string;
  usage?: TokenUsage;
  durationMs: number;
}

function createAdapter(config: AIConfig): ProviderAdapter {
  switch (config.provider) {
    case 'openai':
      return new OpenAIAdapter(config.model, config.apiKey ?? '', config.baseUrl);
    case 'anthropic':
      return new AnthropicAdapter(config.model, config.apiKey ?? '', config.baseUrl);
    case 'ollama':
      return new OllamaAdapter(config.model, config.baseUrl);
  }
}

/** Quita la API key (y cualquier otra credencial) antes de adjuntar la petición al reporte. */
function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const secret = /authorization|api-key|token/i;
  return Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, secret.test(k) ? '***' : v]));
}

/** Extrae el primer objeto JSON de la respuesta (tolera ```json ... ``` y texto alrededor). */
export function extractJson(text: string): unknown {
  const withoutFences = text.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end <= start) throw new AIResponseFormatError(`La respuesta no contiene un objeto JSON: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch (error) {
    throw new AIResponseFormatError(`JSON inválido en la respuesta de la IA (${(error as Error).message}): ${text.slice(0, 300)}`);
  }
}

/** JSON Schema del esquema zod (las validaciones que no se pueden expresar, como refine, se comprueban después). */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> | undefined {
  try {
    const { $schema: _ignored, ...jsonSchema } = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
    return jsonSchema;
  } catch {
    return undefined;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cliente de IA único para OpenAI, Anthropic y Ollama.
 * - Reintenta ante errores de red, 429 y 5xx con espera exponencial.
 * - Si el modelo no admite "temperature" (p. ej. modelos de razonamiento) repite la llamada sin ella.
 * - Notifica cada intercambio completo (petición + respuesta) a los listeners para adjuntarlo al reporte.
 */
export class AIClient {
  private readonly adapter: ProviderAdapter;
  private readonly listeners: AIExchangeListener[];
  private includeTemperature = true;
  private sequence = 0;

  constructor(
    readonly config: AIConfig,
    listeners: AIExchangeListener[] = [],
  ) {
    this.adapter = createAdapter(config);
    this.listeners = listeners;
  }

  get description(): string {
    return `${this.config.provider}/${this.config.model}`;
  }

  async complete(request: ChatRequest): Promise<AICompletion> {
    const id = ++this.sequence;
    const startedAt = new Date();
    let http: HttpRequest = this.adapter.buildRequest(request, { includeTemperature: this.includeTemperature });
    let attempts = 0;
    let lastStatus: number | undefined;
    let lastBody: unknown;
    let lastError: Error | undefined;

    const report = async (extra: Partial<AIExchange>) => {
      const exchange: AIExchange = {
        id,
        purpose: request.purpose,
        provider: this.config.provider,
        model: this.config.model,
        startedAt: startedAt.toISOString(),
        durationMs: Date.now() - startedAt.getTime(),
        attempts,
        ok: false,
        request: { url: http.url, headers: redactHeaders(http.headers), body: http.body },
        ...(lastStatus !== undefined ? { response: { status: lastStatus, body: lastBody } } : {}),
        ...extra,
      };
      for (const listener of this.listeners) await listener(exchange);
    };

    while (attempts <= this.config.maxRetries) {
      attempts++;
      try {
        const response = await fetch(http.url, {
          method: 'POST',
          headers: http.headers,
          body: JSON.stringify(http.body),
          signal: AbortSignal.timeout(this.config.timeoutMs),
        });
        lastStatus = response.status;
        const raw = await response.text();
        try {
          lastBody = JSON.parse(raw);
        } catch {
          lastBody = raw;
        }

        if (response.ok) {
          const parsed = this.adapter.parseResponse(lastBody);
          await report({ ok: true, text: parsed.text, usage: parsed.usage });
          return { text: parsed.text, usage: parsed.usage, durationMs: Date.now() - startedAt.getTime() };
        }

        if (response.status === 400 && this.includeTemperature && /temperature/i.test(raw)) {
          this.includeTemperature = false;
          http = this.adapter.buildRequest(request, { includeTemperature: false });
          attempts--;
          continue;
        }

        lastError = new AIProviderError(`${this.description} respondió HTTP ${response.status}: ${raw.slice(0, 500)}`, response.status);
        const retryable = response.status === 429 || response.status >= 500;
        if (!retryable) break;
      } catch (error) {
        const cause = error as Error;
        lastError =
          cause.name === 'TimeoutError'
            ? new AIProviderError(`${this.description} no respondió en ${this.config.timeoutMs} ms (AI_TIMEOUT_MS)`)
            : new AIProviderError(`No se pudo conectar con ${this.description} en ${http.url}: ${cause.message}`);
      }
      if (attempts <= this.config.maxRetries) await sleep(1_000 * 2 ** (attempts - 1));
    }

    await report({ ok: false, error: lastError?.message });
    throw lastError ?? new AIProviderError(`Fallo desconocido llamando a ${this.description}`);
  }

  /**
   * Pide una respuesta JSON y la valida con un esquema zod.
   * Si el modelo devuelve algo inválido se le reenvía el error para que lo corrija (hasta `attempts` veces).
   */
  async completeJSON<T>(request: ChatRequest, schema: z.ZodType<T>, attempts = 3): Promise<T> {
    let feedback = '';
    let lastProblem = '';
    const jsonSchema = toJsonSchema(schema);
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const completion = await this.complete({ ...request, json: true, jsonSchema, user: request.user + feedback });
      try {
        const result = schema.safeParse(extractJson(completion.text));
        if (result.success) return result.data;
        lastProblem = result.error.issues.map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`).join('; ');
      } catch (error) {
        if (!(error instanceof AIResponseFormatError)) throw error;
        lastProblem = error.message;
      }
      feedback =
        `\n\nATENCIÓN: tu respuesta anterior fue rechazada por este motivo: ${lastProblem}. ` +
        'Corrígela y responde únicamente con el objeto JSON pedido.';
    }
    throw new AIResponseFormatError(`La IA no devolvió un JSON válido para "${request.purpose}" tras ${attempts} intentos: ${lastProblem}`);
  }
}
