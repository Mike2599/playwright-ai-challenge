import * as allure from 'allure-js-commons';
import { CONFIRMATION_VARIANTS, ORIGINAL_COPY, pickProducts, pickRandom } from '../../src/data/dynamicCopy';
import { expect, test } from '../../src/fixtures';

/**
 * Flujo completo de compra superando los tres obstáculos del reto a la vez:
 *   1. Selectores rotos a propósito (selectorChaos) → Opción A, self-healing.
 *   2. Mensaje de confirmación que cambia en cada ejecución (intercepción de red) → Opción B, expectAI.
 *   3. Datos del cliente generados en tiempo real, sin valores fijos → Opción C, datos sintéticos.
 * La sesión ya viene iniciada desde el global setup (storageState).
 */
test.describe('Compra E2E resiliente en SauceDemo', { tag: ['@e2e', '@ai'] }, () => {
  test.use({ selectorChaos: true });

  test('un cliente compra dos productos de principio a fin', async ({
    page,
    network,
    healer,
    dataFactory,
    expectAI,
    inventoryPage,
    cartPage,
    checkoutInformationPage,
    checkoutOverviewPage,
    checkoutCompletePage,
  }) => {
    await allure.epic('Flujo de compra');
    await allure.feature('Checkout');
    await allure.story('Compra exitosa con UI cambiante, textos dinámicos y datos sintéticos');
    await allure.severity('blocker');

    const products = pickProducts(2);
    const confirmation = pickRandom(CONFIRMATION_VARIANTS);
    await allure.parameter('Productos', products.join(', '));

    await test.step('Preparar el backend: mensaje de confirmación dinámico', async () => {
      await network.replaceUiText(ORIGINAL_COPY.confirmationHeader, confirmation.header);
      await network.replaceUiText(ORIGINAL_COPY.confirmationText, confirmation.text);
    });

    const customer = await dataFactory.customer({ scenario: 'compra personal con entrega a domicilio' });
    await allure.parameter('Cliente', `${customer.firstName} ${customer.lastName} (${customer.country})`);

    await inventoryPage.goto();
    await inventoryPage.addToCart(...products);
    expect(await inventoryPage.cartCount(), 'contador del carrito').toBe(products.length);

    await inventoryPage.openCart();
    expect((await cartPage.itemNames()).sort(), 'productos en el carrito').toEqual([...products].sort());
    await cartPage.checkout();

    await checkoutInformationPage.fill(customer);
    await checkoutInformationPage.continueToOverview();

    const totals = await checkoutOverviewPage.totals();
    const itemsSum = totals.itemPrices.reduce((a, b) => a + b, 0);
    expect(totals.itemPrices, 'un precio por producto').toHaveLength(products.length);
    expect(totals.subtotal, 'subtotal = suma de los productos').toBe(itemsSum);
    expect(totals.total, 'total = subtotal + impuesto').toBe(totals.subtotal + totals.tax);

    await checkoutOverviewPage.finish();
    await expect(page).toHaveURL(/checkout-complete/);

    const message = await checkoutCompletePage.confirmationMessage();
    await expectAI(
      message,
      'Confirma que la compra se completó con éxito, agradece al cliente y le informa que su pedido va en camino, con un tono positivo',
    );

    await test.step('Los tres obstáculos se superaron', async () => {
      expect(healer.events.length, 'selectores reparados por la IA').toBeGreaterThan(0);
      expect(message, 'el texto no coincide con el original: solo una validación semántica lo aprueba').not.toContain(
        ORIGINAL_COPY.confirmationHeader,
      );
      await allure.parameter('Selectores reparados', String(healer.events.length));
    });
  });
});
