export type AIProviderName = 'openai' | 'anthropic' | 'ollama';

export interface AIConfig {
  provider: AIProviderName;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  timeoutMs: number;
  maxRetries: number;
}

/** Petición de alto nivel: el cliente la traduce al formato de cada proveedor. */
export interface ChatRequest {
  /** Para qué se usa la llamada (aparece en el reporte): "self-healing", "semantic-assertion"... */
  purpose: string;
  system: string;
  user: string;
  /** Pide al modelo que responda solo con un objeto JSON. */
  json?: boolean;
  /** JSON Schema de la respuesta esperada (salida estructurada cuando el proveedor la soporta). */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
}

/** Petición HTTP concreta que se envía al proveedor (sin la API key). */
export interface HttpRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ParsedResponse {
  text: string;
  usage?: TokenUsage;
}

export interface ProviderAdapter {
  readonly name: AIProviderName;
  buildRequest(request: ChatRequest, options: { includeTemperature: boolean }): HttpRequest;
  parseResponse(body: unknown): ParsedResponse;
}

/** Registro completo de una llamada a la IA: se adjunta al reporte (Allure / HTML). */
export interface AIExchange {
  id: number;
  purpose: string;
  provider: AIProviderName;
  model: string;
  startedAt: string;
  durationMs: number;
  attempts: number;
  ok: boolean;
  request: { url: string; headers: Record<string, string>; body: Record<string, unknown> };
  response?: { status: number; body: unknown };
  text?: string;
  usage?: TokenUsage;
  error?: string;
}

export type AIExchangeListener = (exchange: AIExchange) => void | Promise<void>;
