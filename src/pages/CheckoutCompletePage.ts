import type { ElementTarget, SelfHealingLocator } from '../healing/SelfHealingLocator';

/** Confirmación de la compra (/checkout-complete.html). */
export class CheckoutCompletePage {
  static readonly header: ElementTarget = {
    name: 'título del mensaje de confirmación de la compra',
    selector: '[data-test="complete-header"]',
    container: '.checkout_complete_container',
  };
  static readonly text: ElementTarget = {
    name: 'texto descriptivo del mensaje de confirmación de la compra (debajo del título)',
    selector: '[data-test="complete-text"]',
    container: '.checkout_complete_container',
  };

  constructor(private readonly healer: SelfHealingLocator) {}

  /** Título + texto, tal como los lee el cliente. */
  async confirmationMessage(): Promise<string> {
    const header = await this.healer.textOf(CheckoutCompletePage.header);
    const text = await this.healer.textOf(CheckoutCompletePage.text);
    return `${header}\n${text}`;
  }
}
