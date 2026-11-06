import path from 'node:path';
import { test as base, expect, type TestInfo } from '@playwright/test';
import { env, PATHS } from '../../config/env';
import { AIClient } from '../ai/AIClient';
import { aiConfigFromEnv } from '../ai/config';
import type { AIExchange } from '../ai/types';
import { createExpectAI, type ExpectAI } from '../assertions/expectAI';
import { SyntheticDataGenerator } from '../data/SyntheticDataGenerator';
import { SelfHealingLocator, type HealingEvent } from '../healing/SelfHealingLocator';
import { installSelectorChaos } from '../healing/selectorChaos';
import { NetworkRecorder } from '../network/NetworkRecorder';
import { SauceDemoNetwork } from '../network/SauceDemoNetwork';
import { CartPage } from '../pages/CartPage';
import { CheckoutCompletePage } from '../pages/CheckoutCompletePage';
import { CheckoutInformationPage } from '../pages/CheckoutInformationPage';
import { CheckoutOverviewPage } from '../pages/CheckoutOverviewPage';
import { InventoryPage } from '../pages/InventoryPage';
import { appendJsonLine } from '../utils/jsonl';

type Options = {
  /** Activa el obstáculo 1: renombra data-test e id del DOM en cada carga (ver selectorChaos.ts). */
  selectorChaos: boolean;
};

type Fixtures = {
  /** Cliente de IA encapsulado; cada petición/respuesta queda adjunta al reporte. */
  ai: AIClient;
  /** Opción B: aserción semántica expectAI(texto, intención) y expectAI.not(...). */
  expectAI: ExpectAI;
  /** Opción A: localizador auto-reparable. */
  healer: SelfHealingLocator;
  /** Opción C: datos sintéticos generados con IA. */
  dataFactory: SyntheticDataGenerator;
  /** Intercepción y modificación de respuestas de red. */
  network: SauceDemoNetwork;
  /** Captura automática del tráfico de red de cada prueba (adjunto network-traffic.json). */
  networkRecorder: NetworkRecorder;
  inventoryPage: InventoryPage;
  cartPage: CartPage;
  checkoutInformationPage: CheckoutInformationPage;
  checkoutOverviewPage: CheckoutOverviewPage;
  checkoutCompletePage: CheckoutCompletePage;
};

const workerLog = (kind: string) => path.join(PATHS.aiLogs, `${kind}-${process.pid}.jsonl`);
const testName = (testInfo: TestInfo) => testInfo.titlePath.slice(1).join(' › ');
const asJson = (value: unknown) => ({ body: JSON.stringify(value, null, 2), contentType: 'application/json' });

export const test = base.extend<Fixtures & Options>({
  selectorChaos: [false, { option: true }],

  page: async ({ page, selectorChaos }, use) => {
    if (selectorChaos) await page.addInitScript(installSelectorChaos);
    await use(page);
  },

  networkRecorder: [
    async ({ page }, use, testInfo) => {
      const recorder = new NetworkRecorder(page);
      await use(recorder);
      const entries = await recorder.collect();
      await testInfo.attach('network-traffic.json', asJson(entries));
    },
    { auto: true },
  ],

  ai: async ({}, use, testInfo) => {
    const attachExchange = async (exchange: AIExchange) => {
      const status = exchange.ok ? 'ok' : 'error';
      await testInfo.attach(`IA #${exchange.id} · ${exchange.purpose} · petición y respuesta (${status})`, asJson(exchange));
    };
    const logExchange = (exchange: AIExchange) =>
      appendJsonLine(workerLog('ai-calls'), {
        test: testName(testInfo),
        purpose: exchange.purpose,
        provider: exchange.provider,
        model: exchange.model,
        ok: exchange.ok,
        durationMs: exchange.durationMs,
        attempts: exchange.attempts,
        usage: exchange.usage,
      });
    await use(new AIClient(aiConfigFromEnv(), [attachExchange, logExchange]));
  },

  expectAI: async ({ ai }, use, testInfo) => {
    await use(
      createExpectAI(ai, {
        threshold: env.SEMANTIC_CONFIDENCE_THRESHOLD,
        onVerdict: async (verdict) => {
          await testInfo.attach(`expectAI · veredicto (${verdict.passed ? 'cumple' : 'no cumple'})`, asJson(verdict));
          appendJsonLine(workerLog('semantic'), { test: testName(testInfo), ...verdict });
        },
      }),
    );
  },

  healer: async ({ page, ai }, use, testInfo) => {
    const onHeal = async (event: HealingEvent) => {
      testInfo.annotations.push({
        type: 'self-healing',
        description: `${event.target}: ${event.brokenSelector} → ${event.healedSelector}`,
      });
      await testInfo.attach(`self-healing · ${event.target}`, asJson(event));
      appendJsonLine(workerLog('healing'), { test: testName(testInfo), ...event });
    };
    await use(new SelfHealingLocator(page, ai, { primaryTimeoutMs: env.SELF_HEALING_TIMEOUT_MS, onHeal }));
  },

  dataFactory: async ({ ai }, use, testInfo) => {
    await use(
      new SyntheticDataGenerator(ai, async (profile, request) => {
        await testInfo.attach(`datos sintéticos · cliente ${request.country}`, asJson({ request, profile }));
      }),
    );
  },

  network: async ({ page }, use, testInfo) => {
    const network = new SauceDemoNetwork(page);
    await use(network);
    if (network.records.length) await testInfo.attach('network-interception.json', asJson(network.records));
    network.verify();
  },

  inventoryPage: async ({ page, healer }, use) => use(new InventoryPage(page, healer)),
  cartPage: async ({ page, healer }, use) => use(new CartPage(page, healer)),
  checkoutInformationPage: async ({ page, healer }, use) => use(new CheckoutInformationPage(page, healer)),
  checkoutOverviewPage: async ({ page, healer }, use) => use(new CheckoutOverviewPage(page, healer)),
  checkoutCompletePage: async ({ healer }, use) => use(new CheckoutCompletePage(healer)),
});

export { expect };
