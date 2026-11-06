import { test, type Page } from '@playwright/test';
import type { ElementTarget, SelfHealingLocator } from '../healing/SelfHealingLocator';

/** Carrito (/cart.html). */
export class CartPage {
  static readonly itemNames: ElementTarget = {
    name: 'nombres de los productos que hay en el carrito',
    selector: '[data-test="inventory-item-name"]',
    container: '.cart_list',
    multiple: true,
  };
  static readonly checkoutButton: ElementTarget = {
    name: 'botón Checkout del carrito',
    selector: '[data-test="checkout"]',
    container: '.cart_footer',
    textHint: 'Checkout',
  };

  constructor(
    private readonly page: Page,
    private readonly healer: SelfHealingLocator,
  ) {}

  async itemNames(): Promise<string[]> {
    return this.healer.textsOf(CartPage.itemNames);
  }

  async checkout(): Promise<void> {
    await test.step('Ir al checkout', async () => {
      await this.healer.click(CartPage.checkoutButton);
      await this.page.waitForURL('**/checkout-step-one.html');
    });
  }
}
