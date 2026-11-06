import { test, type Page } from '@playwright/test';
import type { ElementTarget, SelfHealingLocator } from '../healing/SelfHealingLocator';

export interface CheckoutCustomer {
  firstName: string;
  lastName: string;
  postalCode: string;
}

/** Paso 1 del checkout: datos del cliente (/checkout-step-one.html). */
export class CheckoutInformationPage {
  static readonly firstName: ElementTarget = {
    name: 'campo de texto First Name (nombre)',
    selector: '[data-test="firstName"]',
    container: '.checkout_info',
    textHint: 'First Name',
  };
  static readonly lastName: ElementTarget = {
    name: 'campo de texto Last Name (apellido)',
    selector: '[data-test="lastName"]',
    container: '.checkout_info',
    textHint: 'Last Name',
  };
  static readonly postalCode: ElementTarget = {
    name: 'campo de texto Zip/Postal Code (código postal)',
    selector: '[data-test="postalCode"]',
    container: '.checkout_info',
    textHint: 'Postal Code',
  };
  static readonly continueButton: ElementTarget = {
    name: 'botón Continue del formulario de checkout',
    selector: '[data-test="continue"]',
    container: '.checkout_buttons',
    textHint: 'Continue',
  };
  static readonly error: ElementTarget = {
    name: 'mensaje de error del formulario de checkout',
    selector: '[data-test="error"]',
    container: '.checkout_info',
    textHint: 'Error',
  };

  constructor(
    private readonly page: Page,
    private readonly healer: SelfHealingLocator,
  ) {}

  async fill(customer: CheckoutCustomer): Promise<void> {
    await test.step(`Diligenciar datos del cliente: ${customer.firstName} ${customer.lastName} (${customer.postalCode})`, async () => {
      await this.healer.fill(CheckoutInformationPage.firstName, customer.firstName);
      await this.healer.fill(CheckoutInformationPage.lastName, customer.lastName);
      await this.healer.fill(CheckoutInformationPage.postalCode, customer.postalCode);
    });
  }

  async continue(): Promise<void> {
    await test.step('Continuar al resumen de la orden', async () => {
      await this.healer.click(CheckoutInformationPage.continueButton);
    });
  }

  async continueToOverview(): Promise<void> {
    await this.continue();
    await this.page.waitForURL('**/checkout-step-two.html');
  }

  async errorMessage(): Promise<string> {
    return this.healer.textOf(CheckoutInformationPage.error);
  }
}
