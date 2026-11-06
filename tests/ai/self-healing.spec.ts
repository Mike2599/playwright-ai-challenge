import * as allure from 'allure-js-commons';
import { pickProducts } from '../../src/data/dynamicCopy';
import { expect, test } from '../../src/fixtures';
import { SelfHealingError } from '../../src/healing/SelfHealingLocator';
import { InventoryPage } from '../../src/pages/InventoryPage';

test.describe('Opción A · Selectores auto-reparables', { tag: ['@ai', '@self-healing'] }, () => {
  test.beforeEach(async () => {
    await allure.epic('Retos de IA');
    await allure.feature('Opción A - Self-healing selectors');
  });

  test.describe('con cambios deliberados en el DOM', () => {
    test.use({ selectorChaos: true });

    test('los localizadores originales se rompen y la IA los repara sin detener la prueba', async ({
      page,
      healer,
      inventoryPage,
      cartPage,
    }) => {
      await allure.severity('critical');
      const [product] = pickProducts(1);

      await inventoryPage.goto();

      await test.step('Comprobar que el DOM cambió: los data-test e id originales ya no existen', async () => {
        await expect(page.locator('.inventory_item').first()).toBeVisible();
        const chaos = await page.evaluate(() => (window as unknown as { __selectorChaos: { token: string; mutations: number } }).__selectorChaos);
        expect(chaos.mutations).toBeGreaterThan(0);
        await expect(page.locator(InventoryPage.addToCartButton(product).selector)).toHaveCount(0);
        await expect(page.locator('[data-test]')).toHaveCount(0);
      });

      await inventoryPage.addToCart(product);
      expect(await inventoryPage.cartCount()).toBe(1);
      await inventoryPage.openCart();
      expect(await cartPage.itemNames()).toEqual([product]);

      await test.step('Verificar la evidencia del self-healing', async () => {
        expect(healer.events.length).toBeGreaterThanOrEqual(3);
        for (const event of healer.events) {
          expect(event.healedSelector).not.toBe(event.brokenSelector);
          expect(event.candidates.at(-1)?.verdict).toBe('aceptado');
        }
      });
    });

    test('si la IA no encuentra un candidato válido el fallo es explícito (control negativo)', async ({ healer, inventoryPage }) => {
      await allure.severity('normal');
      await inventoryPage.goto();

      const missing = {
        name: 'botón "Pay with PayPal" (no existe en SauceDemo)',
        selector: '[data-test="paypal-checkout"]',
        container: '.inventory_list',
        textHint: 'PayPal',
      };

      await expect(healer.resolve(missing)).rejects.toThrow(SelfHealingError);
    });
  });

  test('con el DOM intacto no se consulta a la IA', async ({ healer, inventoryPage }) => {
    await allure.severity('minor');
    const [product] = pickProducts(1);

    await inventoryPage.goto();
    await inventoryPage.addToCart(product);
    expect(await inventoryPage.cartCount()).toBe(1);

    expect(healer.events, 'ningún selector necesitó reparación').toHaveLength(0);
  });
});
