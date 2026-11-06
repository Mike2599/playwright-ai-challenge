import fs from 'node:fs';
import path from 'node:path';
import { chromium, selectors, type FullConfig } from '@playwright/test';
import { env, PATHS } from '../../config/env';
import { AIClient } from '../ai/AIClient';
import { aiConfigFromEnv } from '../ai/config';
import { LoginPage } from '../pages/LoginPage';

/**
 * Global setup:
 *  1. Limpia los resultados y bitácoras de la ejecución anterior.
 *  2. Comprueba que el proveedor de IA responde (y precarga el modelo si es Ollama) para fallar rápido con un mensaje claro.
 *  3. Inicia sesión UNA sola vez y guarda el estado de autenticación en .auth/storageState.json.
 *     Todas las pruebas lo cargan (use.storageState) y empiezan ya autenticadas, sin repetir el login.
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  for (const dir of [PATHS.aiLogs, PATHS.allureResults]) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(PATHS.aiLogs, { recursive: true });

  await checkAiProvider();
  await saveAuthenticatedState(config);
}

async function checkAiProvider(): Promise<void> {
  const ai = new AIClient(aiConfigFromEnv());
  const started = Date.now();
  try {
    await ai.complete({ purpose: 'health-check', system: 'Eres un servicio de salud. Responde solo "OK".', user: 'ping', maxTokens: 5 });
  } catch (error) {
    throw new Error(
      `[global-setup] El proveedor de IA ${ai.description} no está disponible: ${(error as Error).message}\n` +
        'Revisa AI_PROVIDER, AI_API_KEY, AI_MODEL y AI_BASE_URL en .env (con Ollama: que el servicio esté corriendo y el modelo descargado).',
    );
  }
  console.log(`[global-setup] IA lista: ${ai.description} (${Date.now() - started} ms)`);
}

async function saveAuthenticatedState(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use.baseURL ?? env.BASE_URL;
  const testIdAttribute = config.projects[0]?.use.testIdAttribute;
  if (testIdAttribute) selectors.setTestIdAttribute(testIdAttribute);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const loginPage = new LoginPage(page);

    await loginPage.goto();
    await loginPage.login(env.SAUCE_USERNAME, env.SAUCE_PASSWORD);
    await page.waitForURL('**/inventory.html', { timeout: 15_000 }).catch(async () => {
      const message = (await loginPage.error.isVisible()) ? await loginPage.error.innerText() : 'sin mensaje de error';
      throw new Error(`[global-setup] No se pudo iniciar sesión como "${env.SAUCE_USERNAME}": ${message}`);
    });

    const state = await context.storageState();
    // SauceDemo crea la cookie "session-username" con una vida de solo 10 minutos y la valida solo en el navegador
    // (no hay sesión en servidor). Una ejecución completa con un LLM local puede durar más, así que se extiende
    // su caducidad a SESSION_TTL_MINUTES para que el estado guardado sirva durante toda la ejecución.
    const expires = Math.floor(Date.now() / 1000) + env.SESSION_TTL_MINUTES * 60;
    state.cookies = state.cookies.map((cookie) =>
      cookie.name === 'session-username' ? { ...cookie, expires: Math.max(cookie.expires, expires) } : cookie,
    );

    fs.mkdirSync(path.dirname(PATHS.storageState), { recursive: true });
    fs.writeFileSync(PATHS.storageState, JSON.stringify(state, null, 2));
    console.log(`[global-setup] Sesión de "${env.SAUCE_USERNAME}" guardada en ${path.relative(process.cwd(), PATHS.storageState)}`);
  } finally {
    await browser.close();
  }
}
