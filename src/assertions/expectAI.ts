import { expect, test, type Locator } from '@playwright/test';
import { z } from 'zod';
import type { AIClient } from '../ai/AIClient';

// El orden importa: con salida estructurada el modelo genera los campos en este orden, así que primero
// describe el texto y razona, y solo después emite el veredicto (en vez de decidir y justificar a posteriori).
const VerdictSchema = z.object({
  detectedIntent: z.string(),
  reasoning: z.string(),
  matches: z.boolean(),
  confidence: z.coerce.number().min(0).max(1),
});

export interface SemanticVerdict extends z.infer<typeof VerdictSchema> {
  actualText: string;
  expectedIntent: string;
  negated: boolean;
  threshold: number;
  passed: boolean;
}

export interface ExpectAIOptions {
  /** Confianza mínima (0-1). Por defecto SEMANTIC_CONFIDENCE_THRESHOLD. */
  threshold?: number;
  /** Aserción blanda: registra el fallo pero deja seguir la prueba. */
  soft?: boolean;
}

type Assertion = (actual: string | Locator, expectedIntent: string, options?: ExpectAIOptions) => Promise<SemanticVerdict>;
export type ExpectAI = Assertion & { not: Assertion };

const SYSTEM_PROMPT = `Eres un evaluador de calidad (QA) que verifica textos de una interfaz de usuario por su SIGNIFICADO.
Recibes un TEXTO REAL tomado de la UI y una INTENCIÓN ESPERADA. Decide si el texto cumple esa intención:
- Juzga el significado, no las palabras exactas. Paráfrasis, sinónimos u otro idioma son válidos.
- Primero identifica TODO lo que comunica el texto (cada idea, no solo la última) y su tono.
- Evalúa SOLO los aspectos que menciona la intención. Si la intención no habla del tono, el tono no cuenta;
  si lo menciona (amable, positivo, formal...), el texto también debe tener ese tono.
- Si el texto comunica algo distinto, contradictorio o incompleto respecto a lo que pide la intención, no la cumple.
- La información adicional que no contradice la intención NO la incumple: si todo lo que pide la intención está
  en el texto, "matches" es true, aunque el texto diga más cosas o tenga un tono que la intención no menciona.
- Sé coherente: si tu razonamiento concluye que la intención se cumple, "matches" debe ser true.
- "confidence" es tu seguridad en el veredicto (0 a 1), no el grado de parecido.

Responde solo con este JSON:
{"detectedIntent": "todas las ideas que comunica el texto y su tono", "reasoning": "contrasta cada aspecto de la intención con el texto", "matches": true|false, "confidence": 0.0-1.0}`;

/**
 * Aserción semántica con IA (Opción B del reto):
 *   await expectAI(textoDeLaUI, 'confirma que la compra se completó y agradece al cliente');
 *   await expectAI.not(locator, 'informa un error en el pago');
 * Acepta un texto o un Locator (usa su innerText). Falla como cualquier expect de Playwright y deja el veredicto
 * de la IA adjunto en el reporte.
 */
export function createExpectAI(ai: AIClient, defaults: { threshold: number; onVerdict?: (verdict: SemanticVerdict) => Promise<void> | void }): ExpectAI {
  const run = (negated: boolean): Assertion => async (actual, expectedIntent, options = {}) => {
    const threshold = options.threshold ?? defaults.threshold;
    const label = `expectAI${negated ? '.not' : ''}: "${expectedIntent}"`;

    return test.step(label, async () => {
      let actualText: string;
      if (typeof actual === 'string') {
        actualText = actual;
      } else {
        await expect(actual).toBeVisible();
        actualText = (await actual.innerText()).trim();
      }
      if (!actualText.trim()) throw new Error(`${label}: el texto a evaluar está vacío`);

      const answer = await ai.completeJSON(
        {
          purpose: 'semantic-assertion',
          system: SYSTEM_PROMPT,
          user: `TEXTO REAL:\n"""${actualText}"""\n\nINTENCIÓN ESPERADA:\n"""${expectedIntent}"""`,
          temperature: 0,
          maxTokens: 400,
        },
        VerdictSchema,
      );

      const confident = answer.confidence >= threshold;
      const passed = negated ? !answer.matches && confident : answer.matches && confident;
      const verdict: SemanticVerdict = { ...answer, actualText, expectedIntent, negated, threshold, passed };
      await defaults.onVerdict?.(verdict);

      const message = [
        `${label} no se cumplió.`,
        `  Texto real:          ${actualText}`,
        `  Intención esperada:  ${negated ? 'NO ' : ''}${expectedIntent}`,
        `  Veredicto de la IA:  matches=${answer.matches}, confianza=${answer.confidence} (mínimo ${threshold})`,
        `  Lo que comunica:     ${answer.detectedIntent}`,
        `  Razonamiento:        ${answer.reasoning}`,
      ].join('\n');
      if (options.soft) expect.soft(passed, message).toBe(true);
      else expect(passed, message).toBe(true);
      return verdict;
    });
  };

  return Object.assign(run(false), { not: run(true) });
}
