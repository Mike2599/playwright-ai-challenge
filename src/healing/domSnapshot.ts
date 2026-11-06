import type { Locator, Page } from '@playwright/test';

export interface ContainerContext {
  /** Selector del contenedor que se envió a la IA ("body" si el contenedor tampoco existe). */
  scope: string;
  root: Locator;
  html: string;
  ariaSnapshot: string;
}

const MAX_HTML_CHARS = 9_000;
const MAX_ARIA_CHARS = 3_000;

/**
 * Convierte el DOM del contenedor en un HTML compacto: una etiqueta por línea, indentada,
 * solo con los atributos útiles para construir un selector y sin elementos invisibles,
 * scripts, estilos ni SVG. Así el prompt es pequeño y el modelo no se distrae.
 * Se ejecuta dentro del navegador (por eso no usa nada externo).
 */
function compactHtml(root: Element, maxChars: number): string {
  const SKIP = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'LINK', 'META', 'PATH', 'IFRAME', 'TEMPLATE']);
  const KEEP = /^(id|class|name|type|role|placeholder|value|href|alt|title|for|data-.+|aria-.+)$/;
  const lines: string[] = [];
  let size = 0;

  const visible = (el: Element) => {
    const style = window.getComputedStyle(el);
    return el.getClientRects().length > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  const walk = (el: Element, depth: number) => {
    if (size > maxChars || SKIP.has(el.tagName.toUpperCase()) || !visible(el)) return;
    const attrs = Array.from(el.attributes)
      .filter((attr) => KEEP.test(attr.name))
      .map((attr) => `${attr.name}="${attr.value.slice(0, 80)}"`)
      .join(' ');
    const ownText = Array.from(el.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    const line = `${'  '.repeat(depth)}<${el.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ''}>${ownText}`;
    lines.push(line);
    size += line.length + 1;
    for (const child of Array.from(el.children)) walk(child, depth + 1);
  };

  walk(root, 0);
  const html = lines.join('\n');
  return size > maxChars ? `${html.slice(0, maxChars)}\n<!-- fragmento truncado -->` : html;
}

/** Extrae la estructura actual del contenedor objetivo (DOM compacto + árbol de accesibilidad). */
export async function captureContainerContext(page: Page, containerSelector?: string): Promise<ContainerContext> {
  let scope = 'body';
  let root = page.locator('body');
  if (containerSelector && (await page.locator(containerSelector).count()) > 0) {
    scope = containerSelector;
    root = page.locator(containerSelector).first();
  }

  const html = await root.evaluate(compactHtml, MAX_HTML_CHARS);
  const ariaSnapshot = await root
    .ariaSnapshot({ timeout: 5_000 })
    .then((tree) => (tree.length > MAX_ARIA_CHARS ? `${tree.slice(0, MAX_ARIA_CHARS)}\n# (truncado)` : tree))
    .catch(() => '(no disponible)');

  return { scope, root, html, ariaSnapshot };
}
