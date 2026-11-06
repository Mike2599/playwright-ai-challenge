import * as allure from 'allure-js-commons';
import { expect, test } from '../../src/fixtures';

test.describe('Estado de autenticación (global setup + storageState)', { tag: '@auth' }, () => {
  test.beforeEach(async () => {
    await allure.epic('Framework');
    await allure.feature('Global setup y storageState');
  });

  test('las pruebas arrancan con la sesión iniciada sin repetir el login', async ({ page, context }) => {
    await allure.severity('critical');

    await page.goto('/inventory.html');

    await expect(page).toHaveURL(/\/inventory\.html$/);
    await expect(page.getByTestId('title')).toHaveText('Products');
    await expect(page.getByTestId('login-button')).toHaveCount(0);
    const session = (await context.cookies()).find((cookie) => cookie.name === 'session-username');
    expect(session?.value, 'la cookie de sesión viene de .auth/storageState.json').toBeTruthy();
  });

  test.describe('sin estado guardado', () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test('la aplicación exige iniciar sesión (control negativo)', async ({ page }) => {
      await allure.severity('normal');

      await page.goto('/inventory.html');

      await expect(page.getByTestId('login-button')).toBeVisible();
      await expect(page.getByTestId('error')).toContainText('when you are logged in');
    });
  });
});
