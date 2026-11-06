import type { Locator, Page } from '@playwright/test';

/**
 * Login de SauceDemo. Solo lo usan el global setup (para crear storageState.json) y las pruebas de sesión,
 * por eso usa localizadores estándar sin self-healing (el global setup corre antes de que exista el cliente de IA).
 */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly loginButton: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.username = page.getByTestId('username');
    this.password = page.getByTestId('password');
    this.loginButton = page.getByTestId('login-button');
    this.error = page.getByTestId('error');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async login(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.loginButton.click();
  }
}
