import os from 'node:os';
import { defineConfig, devices } from '@playwright/test';
import { env, PATHS } from './config/env';

const BROWSER_PROJECTS = {
  chromium: devices['Desktop Chrome'],
  firefox: devices['Desktop Firefox'],
  webkit: devices['Desktop Safari'],
} as const;

const unknown = env.BROWSERS.filter((browser) => !(browser in BROWSER_PROJECTS));
if (unknown.length) throw new Error(`BROWSERS tiene valores no soportados: ${unknown.join(', ')} (usa chromium, firefox, webkit)`);

export default defineConfig({
  testDir: './tests',
  outputDir: 'test-results',
  timeout: env.TEST_TIMEOUT_MS,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: env.TEST_ENV === 'ci' || !!process.env.CI,
  retries: env.RETRIES,
  workers: env.WORKERS,

  // Global setup & teardown: login único → .auth/storageState.json, chequeo de la IA y resumen de uso al final.
  globalSetup: './src/setup/global-setup.ts',
  globalTeardown: './src/setup/global-teardown.ts',

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    [
      'allure-playwright',
      {
        resultsDir: PATHS.allureResults,
        detail: true,
        suiteTitle: true,
        environmentInfo: {
          TEST_ENV: env.TEST_ENV,
          BASE_URL: env.BASE_URL,
          AI_PROVIDER: env.AI_PROVIDER,
          AI_MODEL: env.AI_MODEL,
          BROWSERS: env.BROWSERS.join(', '),
          NODE_VERSION: process.version,
          OS: `${os.type()} ${os.release()}`,
        },
        categories: [
          { name: 'Selector no reparado por la IA', messageRegex: '(?s).*SelfHealingError.*|.*No se pudo reparar el localizador.*' },
          { name: 'Aserción semántica no cumplida', messageRegex: '(?s).*expectAI.*no se cumplió.*' },
          { name: 'Proveedor de IA no disponible o respuesta inválida', messageRegex: '(?s).*(AIProviderError|AIResponseFormatError|no respondió en|No se pudo conectar).*' },
          { name: 'Intercepción de red no aplicada', messageRegex: '(?s).*intercepción de red no se aplicó.*' },
        ],
      },
    ],
  ],

  use: {
    baseURL: env.BASE_URL,
    // Estado de autenticación creado por el global setup: las pruebas empiezan con la sesión iniciada.
    storageState: PATHS.storageState,
    testIdAttribute: 'data-test',
    headless: env.HEADLESS,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,

    // Observabilidad y depuración
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: env.BROWSERS.map((name) => ({
    name,
    use: { ...BROWSER_PROJECTS[name as keyof typeof BROWSER_PROJECTS] },
  })),
});
