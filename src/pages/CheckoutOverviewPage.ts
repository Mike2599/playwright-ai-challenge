import { test, type Page } from '@playwright/test';
import type { ElementTarget, SelfHealingLocator } from '../healing/SelfHealingLocator';
import { toCents } from '../utils/money';

export interface OrderTotals {
  itemPrices: number[];
  subtotal: number;
  tax: number;
  total: number;
}

/** Paso 2 del checkout: resumen de la orden (/checkout-step-two.html). Valores en centavos. */
export class CheckoutOverviewPage {
  static readonly itemNames: ElementTarget = {
    name: 'nombres de los productos del resumen de la orden',
    selector: '[data-test="inventory-item-name"]',
    container: '.cart_list',
    multiple: true,
  };
  static readonly itemPrices: ElementTarget = {
    name: 'precios de los productos del resumen de la orden',
    selector: '[data-test="inventory-item-price"]',
    container: '.cart_list',
    multiple: true,
  };
  static readonly subtotal: ElementTarget = {
    name: 'subtotal de la orden (Item total)',
    selector: '[data-test="subtotal-label"]',
    container: '.summary_info',
    textHint: 'Item total',
  };
  static readonly tax: ElementTarget = {
    name: 'impuesto de la orden (Tax)',
    selector: '[data-test="tax-label"]',
    container: '.summary_info',
    textHint: 'Tax',
  };
  static readonly total: ElementTarget = {
    name: 'total a pagar de la orden (Total)',
    selector: '[data-test="total-label"]',
    container: '.summary_info',
    textHint: 'Total',
  };
  static readonly finishButton: ElementTarget = {
    name: 'botón Finish para confirmar la compra',
    selector: '[data-test="finish"]',
    container: '.cart_footer',
    textHint: 'Finish',
  };

  constructor(
    private readonly page: Page,
    private readonly healer: SelfHealingLocator,
  ) {}

  async itemNames(): Promise<string[]> {
    return this.healer.textsOf(CheckoutOverviewPage.itemNames);
  }

  async totals(): Promise<OrderTotals> {
    return test.step('Leer los totales de la orden', async () => ({
      itemPrices: (await this.healer.textsOf(CheckoutOverviewPage.itemPrices)).map(toCents),
      subtotal: toCents(await this.healer.textOf(CheckoutOverviewPage.subtotal)),
      tax: toCents(await this.healer.textOf(CheckoutOverviewPage.tax)),
      total: toCents(await this.healer.textOf(CheckoutOverviewPage.total)),
    }));
  }

  async finish(): Promise<void> {
    await test.step('Finalizar la compra', async () => {
      await this.healer.click(CheckoutOverviewPage.finishButton);
      await this.page.waitForURL('**/checkout-complete.html');
    });
  }
}
