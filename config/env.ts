import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

/**
 * Carga y valida la configuración del proyecto.
 *
 * Precedencia (de mayor a menor):
 *   1. Variables ya definidas en el proceso (línea de comandos, secretos de CI).
 *   2. .env                         → aplicación bajo prueba y proveedor de IA (con secretos, no se versiona).
 *   3. environments/<TEST_ENV>.env  → valores por defecto de cada entorno (workers, reintentos, navegadores...).
 */
export const ROOT_DIR = path.resolve(__dirname, '..');

function readEnvFile(file: string): Record<string, string> {
  return fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
}

function loadEnvFiles(): void {
  const fromDotEnv = readEnvFile(path.join(ROOT_DIR, '.env'));
  const testEnv = process.env.TEST_ENV ?? fromDotEnv.TEST_ENV ?? 'local';
  const environmentFile = path.join(ROOT_DIR, 'environments', `${testEnv}.env`);
  if (!fs.existsSync(environmentFile)) {
    const available = fs
      .readdirSync(path.join(ROOT_DIR, 'environments'))
      .map((file) => file.replace(/\.env$/, ''))
      .join(', ');
    throw new Error(`TEST_ENV="${testEnv}" no existe. Entornos disponibles: ${available}`);
  }
  const merged = { ...readEnvFile(environmentFile), ...fromDotEnv, TEST_ENV: testEnv };
  for (const [key, value] of Object.entries(merged)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFiles();

const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-5-5',
  ollama: 'llama3.1:8b',
} as const;

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);
const optionalString = z.preprocess(emptyToUndefined, z.string().optional());
const numberWithDefault = (fallback: number) => z.preprocess(emptyToUndefined, z.coerce.number().positive().default(fallback));
const booleanWithDefault = (fallback: boolean) =>
  z.preprocess(
    (value) => (value === undefined || value === '' ? fallback : String(value).toLowerCase() === 'true'),
    z.boolean(),
  );

const EnvSchema = z
  .object({
    TEST_ENV: z.string(),
    BASE_URL: z.preprocess(emptyToUndefined, z.string().url().default('https://www.saucedemo.com')),
    SAUCE_USERNAME: z.preprocess(emptyToUndefined, z.string().default('standard_user')),
    SAUCE_PASSWORD: z.preprocess(emptyToUndefined, z.string().default('secret_sauce')),
    SESSION_TTL_MINUTES: numberWithDefault(120),

    AI_PROVIDER: z.preprocess(emptyToUndefined, z.enum(['openai', 'anthropic', 'ollama']).default('openai')),
    AI_API_KEY: optionalString,
    AI_MODEL: optionalString,
    AI_BASE_URL: optionalString,
    AI_TIMEOUT_MS: numberWithDefault(120_000),
    AI_MAX_RETRIES: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(2)),

    SELF_HEALING_TIMEOUT_MS: numberWithDefault(3_000),
    SEMANTIC_CONFIDENCE_THRESHOLD: z.preprocess(emptyToUndefined, z.coerce.number().min(0).max(1).default(0.7)),

    BROWSERS: z.preprocess(emptyToUndefined, z.string().default('chromium')),
    WORKERS: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(1)),
    RETRIES: z.preprocess(emptyToUndefined, z.coerce.number().int().min(0).default(0)),
    HEADLESS: booleanWithDefault(true),
    TEST_TIMEOUT_MS: numberWithDefault(600_000),
  })
  .superRefine((value, ctx) => {
    if (value.AI_PROVIDER !== 'ollama' && !value.AI_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['AI_API_KEY'],
        message: `AI_PROVIDER=${value.AI_PROVIDER} necesita AI_API_KEY (cópiala en .env, ver .env.example)`,
      });
    }
  })
  .transform((value) => ({
    ...value,
    AI_MODEL: value.AI_MODEL ?? DEFAULT_MODELS[value.AI_PROVIDER],
    BROWSERS: value.BROWSERS.split(',').map((browser) => browser.trim()).filter(Boolean),
  }));

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Configuración inválida en .env / environments:\n${problems}`);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;

/** Rutas compartidas entre el global setup, los fixtures y el global teardown. */
export const PATHS = {
  storageState: path.join(ROOT_DIR, '.auth', 'storageState.json'),
  aiLogs: path.join(ROOT_DIR, '.ai-logs'),
  allureResults: path.join(ROOT_DIR, 'allure-results'),
} as const;
