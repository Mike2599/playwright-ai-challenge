import type { Page, Request } from '@playwright/test';

export interface NetworkEntry {
  method: string;
  url: string;
  resourceType: string;
  status?: number;
  failure?: string;
  durationMs?: number;
  requestHeaders: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
}

const BODY_TYPES = new Set(['document', 'xhr', 'fetch']);
const MAX_BODY = 4_000;
const HEADERS_TO_KEEP = /^(content-type|content-length|cache-control|accept|referer|user-agent|x-.*)$/i;

const pickHeaders = (headers: Record<string, string>) =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => HEADERS_TO_KEEP.test(name)));

const truncate = (text: string) => (text.length > MAX_BODY ? `${text.slice(0, MAX_BODY)}… (${text.length} caracteres)` : text);

/**
 * Captura todas las peticiones y respuestas de la página durante una prueba.
 * Al final el fixture las adjunta al reporte (Allure y HTML) como network-traffic.json.
 * Guarda el cuerpo de documentos y llamadas xhr/fetch; de los recursos estáticos solo los metadatos.
 */
export class NetworkRecorder {
  private readonly entries: NetworkEntry[] = [];
  private readonly pending: Promise<void>[] = [];

  constructor(page: Page) {
    page.on('requestfinished', (request) => this.pending.push(this.capture(request)));
    page.on('requestfailed', (request) =>
      this.pending.push(this.capture(request, request.failure()?.errorText ?? 'desconocido')),
    );
  }

  async collect(): Promise<NetworkEntry[]> {
    await Promise.allSettled(this.pending);
    return this.entries;
  }

  private async capture(request: Request, failure?: string): Promise<void> {
    const entry: NetworkEntry = {
      method: request.method(),
      url: request.url(),
      resourceType: request.resourceType(),
      requestHeaders: pickHeaders(request.headers()),
      ...(request.postData() ? { requestBody: truncate(request.postData() ?? '') } : {}),
      ...(failure ? { failure } : {}),
    };
    try {
      const timing = request.timing();
      if (timing.responseEnd > 0) entry.durationMs = Math.round(timing.responseEnd);
      const response = await request.response();
      if (response) {
        entry.status = response.status();
        entry.responseHeaders = pickHeaders(await response.allHeaders());
        if (BODY_TYPES.has(entry.resourceType)) entry.responseBody = truncate(await response.text());
      }
    } catch {
      // La página o el contexto ya se cerraron: se conserva lo capturado hasta aquí.
    }
    this.entries.push(entry);
  }
}
