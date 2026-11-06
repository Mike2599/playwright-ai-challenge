import { test, type Page, type Route } from '@playwright/test';

/**
 * Intercepción de red sobre SauceDemo.
 *
 * SauceDemo no tiene API REST: el catálogo (nombres, descripciones, precios) y los textos de la UI llegan dentro
 * del bundle JavaScript de la aplicación (/assets/index-*.js). Ese bundle es, en la práctica, la "respuesta del backend".
 * Esta clase lo intercepta con page.route(), lo descarga con route.fetch() y lo modifica en tiempo de ejecución
 * para simular respuestas dinámicas (precios, descripciones, mensajes) o inyectar errores y latencia de red.
 */
export interface InterceptionRecord {
  url: string;
  action: 'modified' | 'failed' | 'aborted' | 'delayed';
  status?: number;
  details: string[];
  timestamp: string;
}

interface BundleTransform {
  description: string;
  apply: (source: string) => { source: string; replacements: number };
}

const BUNDLE_URL = /\/(assets\/index-[^/]+|static\/js\/main[^/]*)\.js(\?.*)?$/;
const PRODUCT_IMAGE_URL = /\.(jpe?g|png|webp)(\?.*)?$/i;

/** Escapa un texto para insertarlo en un literal JS, sin importar si usa comillas simples, dobles o backticks. */
function toJsStringContent(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class SauceDemoNetwork {
  private readonly transforms: BundleTransform[] = [];
  private bundleLatencyMs = 0;
  private bundleRouteInstalled = false;
  readonly records: InterceptionRecord[] = [];
  readonly problems: string[] = [];

  constructor(private readonly page: Page) {}

  /** Cambia el precio y/o la descripción de un producto en la "respuesta" del catálogo. */
  async overrideProduct(productName: string, changes: { price?: number; description?: string }): Promise<void> {
    const q = '["\'`]';
    const pattern = new RegExp(
      `(name:${q}${escapeRegExp(productName)}${q},desc:)(${q})((?:\\\\.|(?!\\2)[^\\\\])*)\\2(,price:)([\\d.]+)`,
      'g',
    );
    await this.addTransform({
      description: `producto "${productName}" → ${JSON.stringify(changes)}`,
      apply: (source) => {
        let replacements = 0;
        const updated = source.replace(pattern, (_m, head: string, quote: string, desc: string, priceKey: string, price: string) => {
          replacements++;
          const newDesc = changes.description !== undefined ? toJsStringContent(changes.description) : desc;
          const newPrice = changes.price !== undefined ? String(changes.price) : price;
          return `${head}${quote}${newDesc}${quote}${priceKey}${newPrice}`;
        });
        return { source: updated, replacements };
      },
    });
  }

  /** Reemplaza un texto literal de la UI (p. ej. el mensaje de confirmación de la compra). */
  async replaceUiText(original: string, replacement: string): Promise<void> {
    await this.addTransform({
      description: `texto "${original}" → "${replacement}"`,
      apply: (source) => {
        const parts = source.split(original);
        return { source: parts.join(toJsStringContent(replacement)), replacements: parts.length - 1 };
      },
    });
  }

  /** Agrega latencia a la descarga de la aplicación (simula un backend lento). */
  async delayApplication(ms: number): Promise<void> {
    this.bundleLatencyMs = ms;
    await this.installBundleRoute();
  }

  /** Inyecta un error HTTP en las imágenes del catálogo (p. ej. 503 de un CDN caído). */
  async failProductImages(status = 503): Promise<void> {
    await this.page.route(PRODUCT_IMAGE_URL, async (route) => {
      this.records.push(this.record(route, 'failed', [`respuesta simulada HTTP ${status}`], status));
      await route.fulfill({ status, contentType: 'text/plain', body: `HTTP ${status} simulado por la prueba` });
    });
  }

  /** Corta la conexión de las peticiones que coincidan (error de red, no HTTP). */
  async abortRequests(url: RegExp, reason: 'failed' | 'internetdisconnected' | 'connectionrefused' | 'timedout' = 'internetdisconnected'): Promise<void> {
    await this.page.route(url, async (route) => {
      this.records.push(this.record(route, 'aborted', [`net::${reason}`]));
      await route.abort(reason);
    });
  }

  /** Falla la prueba si alguna modificación no se pudo aplicar (p. ej. si SauceDemo cambió su bundle). */
  verify(): void {
    if (this.problems.length) throw new Error(`La intercepción de red no se aplicó como se esperaba:\n- ${this.problems.join('\n- ')}`);
  }

  private async addTransform(transform: BundleTransform): Promise<void> {
    this.transforms.push(transform);
    await this.installBundleRoute();
  }

  private async installBundleRoute(): Promise<void> {
    if (this.bundleRouteInstalled) return;
    this.bundleRouteInstalled = true;
    await this.page.route(BUNDLE_URL, async (route) => {
      const response = await route.fetch();
      let source = await response.text();
      const details: string[] = [`respuesta original HTTP ${response.status()} (${source.length} bytes)`];

      for (const transform of this.transforms) {
        const result = transform.apply(source);
        source = result.source;
        if (result.replacements === 0) this.problems.push(`sin coincidencias para ${transform.description}`);
        details.push(`${transform.description}: ${result.replacements} reemplazo(s)`);
      }
      if (this.bundleLatencyMs) {
        details.push(`latencia inyectada: ${this.bundleLatencyMs} ms`);
        await new Promise((resolve) => setTimeout(resolve, this.bundleLatencyMs));
      }

      this.records.push(this.record(route, this.transforms.length ? 'modified' : 'delayed', details, response.status()));
      await route.fulfill({ response, body: source });
    });
  }

  private record(route: Route, action: InterceptionRecord['action'], details: string[], status?: number): InterceptionRecord {
    return { url: route.request().url(), action, status, details, timestamp: new Date().toISOString() };
  }
}

/** Atajo para registrar como paso del reporte la preparación de un escenario de red. */
export function networkStep<T>(title: string, body: () => Promise<T>): Promise<T> {
  return test.step(`Red: ${title}`, body);
}
