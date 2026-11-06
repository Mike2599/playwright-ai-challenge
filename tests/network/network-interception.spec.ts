import { randomInt } from 'node:crypto';
import * as allure from 'allure-js-commons';
import { pickProducts } from '../../src/data/dynamicCopy';
import { expect, test } from '../../src/fixtures';

test.describe('Intercepción de red', { tag: '@network' }, () => {
  test.beforeEach(async () => {
    await allure.epic('Framework');
    await allure.feature('Intercepción de red');
  });

  test('modifica el catálogo en tiempo de ejecución y la UI recalcula los totales', async ({
    page,
    network,
    dataFactory,
    inventoryPage,
    cartPage,
    checkoutInformationPage,
    checkoutOverviewPage,
  }) => {
    await allure.story('Respuesta dinámica del backend');
    const products = pickProducts(2);
    // Precios aleatorios en centavos (entre $5.00 y $150.00): el backend "responde" algo distinto en cada ejecución.
    const mockedPrices = products.map(() => randomInt(500, 15_000));

    await test.step(`Interceptar el catálogo con precios nuevos: ${products.map((p, i) => `${p}=${mockedPrices[i] / 100}`).join(', ')}`, async () => {
      for (const [index, product] of products.entries()) {
        await network.overrideProduct(product, { price: mockedPrices[index] / 100 });
      }
    });

    await inventoryPage.goto();
    for (const [index, product] of products.entries()) {
      expect(await inventoryPage.priceInCentsOf(product), `precio mostrado de ${product}`).toBe(mockedPrices[index]);
    }

    await inventoryPage.addToCart(...products);
    await inventoryPage.openCart();
    await cartPage.checkout();
    await checkoutInformationPage.fill(await dataFactory.customer());
    await checkoutInformationPage.continueToOverview();

    const totals = await checkoutOverviewPage.totals();
    const expectedSubtotal = mockedPrices.reduce((a, b) => a + b, 0);
    const expectedTax = Math.round(expectedSubtotal * 0.08);
    expect.soft(totals.itemPrices.sort(), 'precios de la orden = precios interceptados').toEqual([...mockedPrices].sort());
    expect.soft(totals.subtotal, 'subtotal = suma de los precios interceptados').toBe(expectedSubtotal);
    expect.soft(totals.tax, 'impuesto = 8 % del subtotal').toBe(expectedTax);
    expect(totals.total, 'total = subtotal + impuesto').toBe(expectedSubtotal + expectedTax);

    network.verify();
    expect(network.records.some((record) => record.action === 'modified')).toBe(true);
    await expect(page).toHaveURL(/checkout-step-two/);
  });

  test('error 503 en las imágenes: el catálogo sigue siendo usable', async ({ page, network, inventoryPage }) => {
    await allure.story('Inyección de errores HTTP');
    await network.failProductImages(503);

    await inventoryPage.goto();

    const images = page.locator('img.inventory_item_img');
    await expect(images.first()).toBeAttached();
    const loaded = await images.evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).naturalWidth > 0));
    expect(loaded.length, 'hay imágenes en el catálogo').toBeGreaterThan(0);
    expect(loaded.every((ok) => !ok), 'ninguna imagen pudo cargar (503 inyectado)').toBe(true);
    expect(network.records.filter((record) => record.action === 'failed').length).toBeGreaterThan(0);

    const [product] = pickProducts(1);
    expect(await inventoryPage.priceInCentsOf(product), 'el precio se sigue mostrando').toBeGreaterThan(0);
    await inventoryPage.addToCart(product);
    expect(await inventoryPage.cartCount(), 'el carrito sigue funcionando').toBe(1);
  });

  test('sin conexión con el CDN de fuentes: la UI degrada sin romperse', async ({ page, network, inventoryPage }) => {
    await allure.story('Inyección de errores de red');
    await network.abortRequests(/fonts\.(googleapis|gstatic)\.com/, 'internetdisconnected');
    const failed: string[] = [];
    page.on('requestfailed', (request) => failed.push(request.url()));

    await inventoryPage.goto();

    expect(await inventoryPage.title()).toBe('Products');
    expect(failed.some((url) => url.includes('fonts.googleapis.com')), 'la hoja de estilos de fuentes falló').toBe(true);
    const [product] = pickProducts(1);
    await inventoryPage.addToCart(product);
    expect(await inventoryPage.cartCount()).toBe(1);
  });

  test('backend lento: la aplicación espera la respuesta y renderiza completa', async ({ page, network, inventoryPage }) => {
    await allure.story('Latencia inyectada');
    const latencyMs = randomInt(2_000, 4_000);
    await network.delayApplication(latencyMs);

    const started = Date.now();
    await inventoryPage.goto();
    expect(await inventoryPage.title()).toBe('Products');
    const elapsed = Date.now() - started;

    expect(elapsed, `la página tardó al menos la latencia inyectada (${latencyMs} ms)`).toBeGreaterThanOrEqual(latencyMs);
    await expect(page.locator('.inventory_item')).toHaveCount(6);
  });
});
