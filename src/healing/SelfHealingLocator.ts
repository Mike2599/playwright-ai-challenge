import { errors, test, type Locator, type Page } from '@playwright/test';
import { z } from 'zod';
import type { AIClient } from '../ai/AIClient';
import { captureContainerContext, type ContainerContext } from './domSnapshot';

/** Elemento de la UI tal como lo conoce el framework: nombre de negocio + localizador original. */
export interface ElementTarget {
  /** Descripción legible ("botón Checkout del carrito"). Es lo que la IA usa para entender qué buscar. */
  name: string;
  /** Localizador estándar (CSS o "xpath=..."). Es el que se intenta primero. */
  selector: string;
  /** Contenedor cuyo DOM se envía a la IA si hay que reparar. Si tampoco existe se usa <body>. */
  container?: string;
  /** Texto que el elemento reparado debe contener (texto, value, placeholder o aria-label). Evita falsos positivos. */
  textHint?: string;
  /** El localizador identifica una lista (p. ej. todos los nombres de producto del carrito). */
  multiple?: boolean;
}

export interface HealingCandidateResult {
  selector: string;
  type: 'css' | 'xpath';
  reason: string;
  verdict: 'aceptado' | string;
}

export interface HealingEvent {
  target: string;
  brokenSelector: string;
  healedSelector: string;
  selectorType: 'css' | 'xpath';
  reason: string;
  scope: string;
  aiRounds: number;
  candidates: HealingCandidateResult[];
  durationMs: number;
  model: string;
  timestamp: string;
}

export class SelfHealingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelfHealingError';
  }
}

const CandidatesSchema = z.object({
  candidates: z
    .array(
      z.object({
        selector: z.string().min(1),
        type: z.enum(['css', 'xpath']).default('css'),
        reason: z.string().default(''),
      }),
    )
    .min(1),
});

const SYSTEM_PROMPT = `Eres un experto en automatización web con Playwright especializado en reparar localizadores rotos.
Recibes la descripción de un elemento, el localizador que dejó de funcionar y el estado ACTUAL del contenedor
(árbol de accesibilidad y HTML compacto: una etiqueta por línea, la indentación indica el anidamiento).

Devuelve hasta 3 candidatos ordenados del más al menos probable, con este formato JSON exacto:
{"candidates":[{"selector":"...","type":"css","reason":"..."}]}

Reglas:
- "type" es "css" (CSS estándar) o "xpath" (XPath 1.0). No uses pseudo-selectores propios de Playwright (:has-text, text=, >>).
- Usa SOLO atributos y textos que aparecen en el HTML recibido; nunca inventes atributos.
- Cada selector debe identificar exactamente UN elemento visible, salvo que se indique que se esperan VARIOS:
  en ese caso debe seleccionar todos los elementos de ese tipo y ninguno más.
- Prefiere, en este orden: atributos de prueba (data-*), id, name, placeholder, aria-label, y por último el texto visible (XPath).
- Copia los valores de los atributos completos, incluidos los sufijos aleatorios que tengan.`;

/**
 * Localizador con mecanismo de respaldo (Opción A del reto).
 *
 * 1. Intenta el localizador estándar durante SELF_HEALING_TIMEOUT_MS.
 * 2. Si falla con TimeoutError, extrae el DOM y el árbol de accesibilidad del contenedor objetivo,
 *    se los envía al LLM y le pide el selector CSS/XPath actualizado más probable.
 * 3. Valida cada candidato en la página real (único, visible y con el texto esperado). Si ninguno sirve,
 *    le devuelve al LLM los rechazos y le pide otra ronda.
 * 4. Continúa la interacción con el selector reparado, sin detener la ejecución, y deja evidencia en el reporte.
 */
export class SelfHealingLocator {
  private readonly healed = new Map<string, string>();
  private readonly history: HealingEvent[] = [];

  constructor(
    private readonly page: Page,
    private readonly ai: AIClient,
    private readonly options: {
      primaryTimeoutMs: number;
      maxAiRounds?: number;
      onHeal?: (event: HealingEvent) => Promise<void> | void;
    },
  ) {}

  get events(): readonly HealingEvent[] {
    return this.history;
  }

  async resolve(target: ElementTarget): Promise<Locator> {
    const key = `${target.name}|${target.selector}`;
    const cached = this.healed.get(key);
    if (cached) {
      const locator = this.page.locator(cached);
      if (await this.waitVisible(target.multiple ? locator.first() : locator)) return locator;
      this.healed.delete(key);
    }

    const primary = this.page.locator(target.selector);
    if (await this.waitVisible(target.multiple ? primary.first() : primary)) return primary;

    return test.step(`Self-healing: "${target.name}" no se encontró con ${target.selector}`, async () => {
      const event = await this.heal(target);
      this.healed.set(key, event.healedSelector);
      this.history.push(event);
      await this.options.onHeal?.(event);
      return this.page.locator(event.healedSelector);
    });
  }

  async click(target: ElementTarget): Promise<void> {
    await (await this.resolve(target)).click();
  }

  async fill(target: ElementTarget, value: string): Promise<void> {
    await (await this.resolve(target)).fill(value);
  }

  async textOf(target: ElementTarget): Promise<string> {
    return (await (await this.resolve(target)).innerText()).trim();
  }

  async textsOf(target: ElementTarget): Promise<string[]> {
    const texts = await (await this.resolve({ ...target, multiple: true })).allInnerTexts();
    return texts.map((text) => text.trim());
  }

  /** Espera el elemento; devuelve false solo ante TimeoutError (el disparador del self-healing). */
  private async waitVisible(locator: Locator): Promise<boolean> {
    try {
      await locator.waitFor({ state: 'visible', timeout: this.options.primaryTimeoutMs });
      return true;
    } catch (error) {
      if (error instanceof errors.TimeoutError) return false;
      throw error;
    }
  }

  private async heal(target: ElementTarget): Promise<HealingEvent> {
    const started = Date.now();
    const maxRounds = this.options.maxAiRounds ?? 2;
    const tried: HealingCandidateResult[] = [];
    let context: ContainerContext | undefined;

    for (let round = 1; round <= maxRounds; round++) {
      context = await captureContainerContext(this.page, target.container);
      const { candidates } = await this.ai.completeJSON(
        { purpose: `self-healing: ${target.name}`, system: SYSTEM_PROMPT, user: this.buildPrompt(target, context, tried), temperature: 0 },
        CandidatesSchema,
      );

      const attempts = candidates.flatMap((candidate) => {
        const selector = this.toPlaywrightSelector(candidate.selector);
        const withoutTag = this.withoutTagName(selector);
        return [
          { ...candidate, selector, onlyIfPreviousMissed: false },
          // Corrección de etiqueta: los modelos pequeños suelen llamar "button" a un <input type="submit">.
          // Se prueba el mismo selector sin la etiqueta solo si el original no encontró ningún elemento.
          ...(withoutTag
            ? [{ ...candidate, selector: withoutTag, reason: `${candidate.reason} (sin la etiqueta: el elemento real usa otra)`, onlyIfPreviousMissed: true }]
            : []),
        ];
      });

      let previousVerdict = '';
      for (const attempt of attempts) {
        const skip =
          (attempt.onlyIfPreviousMissed && !previousVerdict.includes('no encuentra ningún elemento')) ||
          tried.some((previous) => this.toPlaywrightSelector(previous.selector) === attempt.selector);
        if (skip) {
          previousVerdict = '';
          continue;
        }
        const verdict = await this.validate(attempt.selector, target);
        previousVerdict = verdict;
        tried.push({ selector: attempt.selector, type: attempt.type, reason: attempt.reason, verdict });
        if (verdict === 'aceptado') {
          return {
            target: target.name,
            brokenSelector: target.selector,
            healedSelector: attempt.selector,
            selectorType: attempt.selector.startsWith('xpath=') ? 'xpath' : 'css',
            reason: attempt.reason,
            scope: context.scope,
            aiRounds: round,
            candidates: tried,
            durationMs: Date.now() - started,
            model: this.ai.description,
            timestamp: new Date().toISOString(),
          };
        }
      }
    }

    const summary = tried.map((c) => `  - ${c.selector} → ${c.verdict}`).join('\n');
    throw new SelfHealingError(
      `No se pudo reparar el localizador de "${target.name}" (${target.selector}) tras ${maxRounds} rondas con ${this.ai.description}.\n` +
        `Contenedor analizado: ${context?.scope ?? 'n/a'}\nCandidatos rechazados:\n${summary || '  (ninguno)'}`,
    );
  }

  private buildPrompt(target: ElementTarget, context: ContainerContext, rejected: HealingCandidateResult[]): string {
    const rejectedText = rejected.length
      ? `\nCandidatos YA PROBADOS y rechazados (no los repitas):\n${rejected.map((c) => `- ${c.selector} → ${c.verdict}`).join('\n')}\n`
      : '';
    return [
      `Elemento buscado: ${target.name}`,
      target.textHint ? `Texto visible esperado en el elemento: "${target.textHint}"` : '',
      target.multiple ? 'Se esperan VARIOS elementos de este tipo: el selector debe seleccionarlos todos.' : '',
      `Localizador que dejó de funcionar (TimeoutError): ${target.selector}`,
      `Contenedor analizado: ${context.scope}`,
      rejectedText,
      'Árbol de accesibilidad del contenedor:',
      context.ariaSnapshot,
      '',
      'HTML actual del contenedor:',
      context.html,
    ]
      .filter((line) => line !== '')
      .join('\n');
  }

  /**
   * El tipo se decide por el contenido del selector, no por la etiqueta que pone el modelo
   * (los modelos pequeños a veces marcan como "xpath" un selector CSS y viceversa).
   */
  /** "button[name='x']" → "[name='x']". Solo para CSS que empieza por una etiqueta seguida de atributos, id o clase. */
  private withoutTagName(selector: string): string | undefined {
    if (selector.startsWith('xpath=')) return undefined;
    const match = selector.match(/^[a-zA-Z][a-zA-Z0-9-]*(?=[[#.])(.+)$/);
    return match ? match[1] : undefined;
  }

  private toPlaywrightSelector(selector: string): string {
    const clean = selector.trim().replace(/^(css=|xpath=)/, '');
    const isXPath = /^(\(|\/|\.\/)/.test(clean);
    return isXPath ? `xpath=${clean}` : clean;
  }

  /** Un candidato solo se acepta si existe, es único, es visible y (si aplica) contiene el texto esperado. */
  private async validate(selector: string, target: ElementTarget): Promise<string> {
    try {
      const all = this.page.locator(selector);
      const count = await all.count();
      if (count === 0) return 'rechazado: no encuentra ningún elemento';
      if (count > 1 && !target.multiple) return `rechazado: encuentra ${count} elementos (no es único)`;
      const locator = all.first();
      if (!(await locator.isVisible())) return 'rechazado: el elemento no es visible';
      if (target.textHint) {
        const texts = await locator.evaluate((el) =>
          [
            (el as HTMLElement).innerText,
            (el as HTMLInputElement).value,
            el.getAttribute('placeholder'),
            el.getAttribute('aria-label'),
          ]
            .filter(Boolean)
            .join(' | '),
        );
        if (!texts.toLowerCase().includes(target.textHint.toLowerCase())) {
          return `rechazado: el elemento dice "${texts.slice(0, 60)}" y se esperaba "${target.textHint}"`;
        }
      }
      return 'aceptado';
    } catch (error) {
      return `rechazado: selector inválido (${(error as Error).message.split('\n')[0]})`;
    }
  }
}
