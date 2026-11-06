import { randomInt } from 'node:crypto';

/**
 * Obstáculo 2 del reto: "descripciones donde el texto varía dinámicamente".
 *
 * SauceDemo siempre muestra el mismo texto, así que la variación se simula del lado del "backend": la intercepción
 * de red reemplaza el texto original por una de estas variantes, elegida al azar en cada ejecución. Todas expresan
 * la misma intención con palabras, longitud e idioma distintos, de modo que una comparación exacta de cadenas
 * fallaría y solo una aserción semántica (expectAI) las valida.
 */
export const ORIGINAL_COPY = {
  confirmationHeader: 'Thank you for your order!',
  confirmationText: 'Your order has been dispatched, and will arrive just as fast as the pony can get there!',
} as const;

export const CONFIRMATION_VARIANTS = [
  { header: 'Order confirmed - thanks for shopping with us!', text: 'Your package is already on its way and should reach you very soon.' },
  { header: '¡Gracias por tu compra!', text: 'Recibimos tu pedido y ya lo estamos preparando para enviártelo lo antes posible.' },
  { header: 'We appreciate your purchase!', text: 'Everything went through. Your items have shipped and will arrive shortly.' },
  { header: '¡Pedido realizado con éxito!', text: 'Muchas gracias por confiar en nosotros. Tu orden fue despachada y llegará pronto.' },
  { header: 'Success! Your order is complete.', text: 'Thanks a lot! Our team has dispatched your order and it will be with you in no time.' },
] as const;

export const BACKPACK_DESCRIPTION_VARIANTS = [
  'A sleek, streamlined backpack that keeps your laptop and tablet safe without sacrificing style.',
  'Mochila de diseño elegante con compartimentos acolchados que protegen tu portátil y tu tableta.',
  'Carry all your gear in style: this slim pack offers unmatched protection for laptops and tablets.',
  'Mochila ligera y moderna, pensada para llevar el computador portátil y la tablet bien protegidos.',
] as const;

/** Mensajes con una intención DISTINTA, para comprobar que expectAI también sabe decir "no". */
export const CONTRADICTORY_CONFIRMATIONS = [
  { header: 'Payment declined', text: 'We could not process your card. Your order has been cancelled and nothing was charged.' },
  { header: 'Pago rechazado', text: 'No pudimos procesar el pago, así que tu pedido fue cancelado. Intenta con otro medio de pago.' },
] as const;

export const pickRandom = <T>(items: readonly T[]): T => items[randomInt(items.length)];

/** Productos del catálogo de SauceDemo (son datos de la aplicación, no datos de entrada de la prueba). */
export const CATALOG = [
  'Sauce Labs Backpack',
  'Sauce Labs Bike Light',
  'Sauce Labs Bolt T-Shirt',
  'Sauce Labs Fleece Jacket',
  'Sauce Labs Onesie',
] as const;

/** n productos distintos elegidos al azar. */
export function pickProducts(count: number): string[] {
  const pool: string[] = [...CATALOG];
  return Array.from({ length: count }, () => pool.splice(randomInt(pool.length), 1)[0]);
}
