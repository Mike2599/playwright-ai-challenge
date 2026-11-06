/**
 * Obstáculo 1 del reto: "cambios deliberados en los selectores del DOM".
 *
 * Simula un despliegue del frontend que renombra los atributos de prueba:
 *   data-test="checkout"  →  data-qa="checkout-k3x9z"
 *   id="checkout"         →  id="checkout_k3x9z"   (solo en elementos de prueba e interactivos)
 * El sufijo es aleatorio en cada carga de página, así que ningún selector se puede "memorizar":
 * los localizadores originales del framework dejan de funcionar y solo el self-healing los recupera.
 *
 * Se inyecta con page.addInitScript() y observa el DOM con un MutationObserver, de modo que también
 * cubre los elementos que React crea o actualiza después (p. ej. "Add to cart" → "Remove").
 */
export function installSelectorChaos(): void {
  const token = Math.random().toString(36).slice(2, 7);
  const state = { token, mutations: 0 };
  (window as unknown as { __selectorChaos: typeof state }).__selectorChaos = state;

  // Los id que la aplicación usa internamente (punto de montaje de React, menú lateral) no se tocan:
  // un refactor real cambia los "ganchos" de prueba, no rompe la aplicación.
  const INTERACTIVE = new Set(['INPUT', 'BUTTON', 'A', 'SELECT', 'TEXTAREA']);
  const mutate = (el: Element) => {
    const dataTest = el.getAttribute('data-test');
    if (dataTest !== null) {
      el.removeAttribute('data-test');
      el.setAttribute('data-qa', `${dataTest}-${token}`);
      state.mutations++;
    }
    const isTestHook = dataTest !== null || el.hasAttribute('data-qa') || INTERACTIVE.has(el.tagName);
    if (el.id && isTestHook && !el.id.endsWith(`_${token}`)) {
      el.id = `${el.id}_${token}`;
      state.mutations++;
    }
  };

  const mutateTree = (node: Node) => {
    if (!(node instanceof Element)) return;
    mutate(node);
    node.querySelectorAll('[data-test], [id]').forEach(mutate);
  };

  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') mutate(record.target as Element);
      record.addedNodes.forEach(mutateTree);
    }
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-test', 'id'] });

  document.addEventListener('DOMContentLoaded', () => mutateTree(document.documentElement));
}
