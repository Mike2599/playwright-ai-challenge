/** Convierte "$29.99" o "Item total: $29.99" en centavos (enteros, para no arrastrar errores de punto flotante). */
export function toCents(text: string): number {
  const match = text.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
  if (!match) throw new Error(`No se encontró un valor monetario en "${text}"`);
  return Math.round(Number(match[1]) * 100);
}

export const formatCents = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** Nombre de producto → sufijo de los data-test de SauceDemo ("Sauce Labs Backpack" → "sauce-labs-backpack"). */
export const productSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-');
