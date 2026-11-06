import { env } from '../../config/env';
import type { AIConfig } from './types';

/** Configuración del cliente de IA a partir de .env (AI_PROVIDER, AI_API_KEY, AI_MODEL...). */
export function aiConfigFromEnv(): AIConfig {
  return {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    apiKey: env.AI_API_KEY,
    baseUrl: env.AI_BASE_URL,
    timeoutMs: env.AI_TIMEOUT_MS,
    maxRetries: env.AI_MAX_RETRIES,
  };
}
