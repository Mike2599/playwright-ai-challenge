import * as allure from 'allure-js-commons';
import {
  BACKPACK_DESCRIPTION_VARIANTS,
  CONFIRMATION_VARIANTS,
  CONTRADICTORY_CONFIRMATIONS,
  ORIGINAL_COPY,
  pickRandom,
} from '../../src/data/dynamicCopy';
import { expect, test } from '../../src/fixtures';
import { CheckoutCompletePage } from '../../src/pages/CheckoutCompletePage';

const PURCHASE_CONFIRMED_INTENT =
  'Confirma que la compra se completó con éxito, agradece al cliente y le informa que su pedido va en camino, con un tono positivo';

test.describe('Opción B · Aserciones semánticas con IA', { tag: ['@ai', '@semantic'] }, () => {
  test.beforeEach(async () => {
    await allure.epic('Retos de IA');
    await allure.feature('Opción B - Semantic AI assertions');
  });

  test('la descripción del producto cambia pero conserva su intención', async ({ network, inventoryPage, expectAI }) => {
    await allure.severity('critical');
    const product = 'Sauce Labs Backpack';
    const variant = pickRandom(BACKPACK_DESCRIPTION_VARIANTS);
    await network.overrideProduct(product, { description: variant });

    await inventoryPage.goto();
    const description = await inventoryPage.descriptionOf(product);

    expect(description, 'el texto mostrado es la variante dinámica').toBe(variant);
    await expectAI(description, 'Describe una mochila con estilo que protege el portátil (laptop) y la tableta');
    await expectAI.not(description, 'Describe una prenda de vestir, como una camiseta o una chaqueta');
  });

  test('el mensaje de confirmación varía pero mantiene la intención y el tono', async ({ page, network, checkoutCompletePage, expectAI }) => {
    await allure.severity('critical');
    const variant = pickRandom(CONFIRMATION_VARIANTS);
    await network.replaceUiText(ORIGINAL_COPY.confirmationHeader, variant.header);
    await network.replaceUiText(ORIGINAL_COPY.confirmationText, variant.text);

    await page.goto('/checkout-complete.html');
    const message = await checkoutCompletePage.confirmationMessage();

    expect(message, 'una comparación exacta con el texto original fallaría').not.toContain(ORIGINAL_COPY.confirmationHeader);
    await expectAI(message, PURCHASE_CONFIRMED_INTENT);
  });

  test('detecta un mensaje con la intención contraria (control negativo)', async ({ page, network, expectAI }) => {
    await allure.severity('normal');
    const contradictory = pickRandom(CONTRADICTORY_CONFIRMATIONS);
    await network.replaceUiText(ORIGINAL_COPY.confirmationHeader, contradictory.header);
    await network.replaceUiText(ORIGINAL_COPY.confirmationText, contradictory.text);

    await page.goto('/checkout-complete.html');
    const container = page.locator(CheckoutCompletePage.header.container!);

    const verdict = await expectAI.not(container, PURCHASE_CONFIRMED_INTENT);
    expect(verdict.matches).toBe(false);
    await expectAI(container, 'Informa que el pago fue rechazado y que el pedido se canceló');
  });

  test('evalúa el tono además del contenido', async ({ expectAI }) => {
    await allure.severity('minor');
    // Mismo contenido (pedido confirmado y en camino), dos tonos distintos.
    const friendly = 'Thank you so much for your order! It was placed successfully and we will ship it to you very soon.';
    const rude = 'Your order was placed and will ship whenever. Now stop emailing us, we have better things to do.';
    const intent = 'Confirma el pedido agradeciendo al cliente con un tono amable y cordial';

    await expectAI(friendly, intent);
    await expectAI.not(rude, intent);
  });
});
