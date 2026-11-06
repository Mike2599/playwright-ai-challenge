import * as allure from 'allure-js-commons';
import { COUNTRIES, type CountryCode } from '../../src/data/countries';
import { pickProducts } from '../../src/data/dynamicCopy';
import { expect, test } from '../../src/fixtures';

test.describe('Opción C · Datos sintéticos generados con IA', { tag: ['@ai', '@synthetic-data'] }, () => {
  test.beforeEach(async () => {
    await allure.epic('Retos de IA');
    await allure.feature('Opción C - Synthetic test data');
  });

  for (const country of ['CO', 'US', 'ES'] as CountryCode[]) {
    test(`genera un cliente válido con el formato de ${COUNTRIES[country].name}`, async ({ dataFactory }) => {
      await allure.severity('normal');
      const customer = await dataFactory.customer({ country });

      expect(customer.country).toBe(country);
      expect(customer.postalCode).toMatch(COUNTRIES[country].postalCode);
      expect(customer.phone.startsWith(COUNTRIES[country].dialCode)).toBe(true);
      expect(customer.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(`${customer.firstName} ${customer.lastName}`).not.toMatch(/john doe|test|lorem/i);
    });
  }

  test('no es determinista: dos perfiles del mismo escenario son distintos', async ({ dataFactory }) => {
    await allure.severity('normal');
    const [first, second] = await dataFactory.customers(2, { country: 'MX', scenario: 'regalo de cumpleaños con entrega sorpresa' });

    expect(`${first.firstName} ${first.lastName}`).not.toBe(`${second.firstName} ${second.lastName}`);
    expect(first.email).not.toBe(second.email);
  });

  test('los datos generados se usan en el checkout y la orden avanza', async ({
    page,
    dataFactory,
    inventoryPage,
    cartPage,
    checkoutInformationPage,
  }) => {
    await allure.severity('critical');
    const customer = await dataFactory.customer({ scenario: 'cliente corporativo que recibe en horario de oficina' });

    await inventoryPage.goto();
    await inventoryPage.addToCart(...pickProducts(1));
    await inventoryPage.openCart();
    await cartPage.checkout();
    await checkoutInformationPage.fill(customer);

    await expect(page.getByTestId('firstName')).toHaveValue(customer.firstName);
    await expect(page.getByTestId('lastName')).toHaveValue(customer.lastName);
    await expect(page.getByTestId('postalCode')).toHaveValue(customer.postalCode);
    await checkoutInformationPage.continueToOverview();
    await expect(page).toHaveURL(/checkout-step-two/);
  });

  test('un perfil sin código postal es rechazado por el formulario (control negativo)', async ({
    dataFactory,
    inventoryPage,
    cartPage,
    checkoutInformationPage,
  }) => {
    await allure.severity('normal');
    const customer = await dataFactory.customer();

    await inventoryPage.goto();
    await inventoryPage.addToCart(...pickProducts(1));
    await inventoryPage.openCart();
    await cartPage.checkout();
    await checkoutInformationPage.fill({ ...customer, postalCode: '' });
    await checkoutInformationPage.continue();

    expect(await checkoutInformationPage.errorMessage()).toContain('Postal Code is required');
  });
});
