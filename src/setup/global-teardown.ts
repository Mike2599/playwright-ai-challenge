import fs from 'node:fs';
import path from 'node:path';
import { PATHS } from '../../config/env';
import type { HealingEvent } from '../healing/SelfHealingLocator';
import { readJsonLines } from '../utils/jsonl';

interface AiCallLog {
  test: string;
  purpose: string;
  provider: string;
  model: string;
  ok: boolean;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number };
}

interface SemanticLog {
  test: string;
  expectedIntent: string;
  passed: boolean;
  confidence: number;
}

/**
 * Global teardown:
 *  1. Consolida lo que escribieron todos los workers en .ai-logs/ y genera ai-usage-summary.json
 *     (llamadas a la IA, latencia, tokens, selectores reparados y aserciones semánticas).
 *     El resumen también se copia a allure-results para que quede junto a los resultados.
 *  2. Elimina .auth/storageState.json: la sesión guardada no sobrevive a la ejecución.
 */
export default async function globalTeardown(): Promise<void> {
  const calls = readJsonLines<AiCallLog>(PATHS.aiLogs, 'ai-calls-');
  const heals = readJsonLines<HealingEvent & { test: string }>(PATHS.aiLogs, 'healing-');
  const semantic = readJsonLines<SemanticLog>(PATHS.aiLogs, 'semantic-');

  const sum = (values: Array<number | undefined>) => values.reduce<number>((acc, value) => acc + (value ?? 0), 0);
  const byPurpose = calls.reduce<Record<string, number>>((acc, call) => {
    const purpose = call.purpose.split(':')[0];
    acc[purpose] = (acc[purpose] ?? 0) + 1;
    return acc;
  }, {});

  const summary = {
    generatedAt: new Date().toISOString(),
    aiCalls: {
      total: calls.length,
      failed: calls.filter((call) => !call.ok).length,
      byPurpose,
      models: [...new Set(calls.map((call) => `${call.provider}/${call.model}`))],
      averageLatencyMs: calls.length ? Math.round(sum(calls.map((c) => c.durationMs)) / calls.length) : 0,
      inputTokens: sum(calls.map((c) => c.usage?.inputTokens)),
      outputTokens: sum(calls.map((c) => c.usage?.outputTokens)),
    },
    selfHealing: heals.map((heal) => ({
      test: heal.test,
      target: heal.target,
      from: heal.brokenSelector,
      to: heal.healedSelector,
      aiRounds: heal.aiRounds,
      durationMs: heal.durationMs,
    })),
    semanticAssertions: semantic.map((verdict) => ({
      test: verdict.test,
      intent: verdict.expectedIntent,
      passed: verdict.passed,
      confidence: verdict.confidence,
    })),
  };

  fs.mkdirSync(PATHS.aiLogs, { recursive: true });
  const summaryFile = path.join(PATHS.aiLogs, 'ai-usage-summary.json');
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));
  if (fs.existsSync(PATHS.allureResults)) fs.copyFileSync(summaryFile, path.join(PATHS.allureResults, 'ai-usage-summary.json'));

  console.log(
    `[global-teardown] IA: ${summary.aiCalls.total} llamadas (${summary.aiCalls.failed} fallidas, ` +
      `${summary.aiCalls.averageLatencyMs} ms promedio) · selectores reparados: ${heals.length} · ` +
      `aserciones semánticas: ${semantic.length} → ${path.relative(process.cwd(), summaryFile)}`,
  );

  fs.rmSync(PATHS.storageState, { force: true });
}
