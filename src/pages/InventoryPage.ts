import { test, type Page } from '@playwright/test';
import type { ElementTarget, SelfHealingLocator } from '../healing/SelfHealingLocator';
import { productSlug, toCents } from '../utils/money';

/** Catálogo de productos (/inventory.html). Todas las interacciones pasan por el localizador auto-reparable. */
export class InventoryPage {
  static readonly title: ElementTarget = {
    name: 'título de la página de productos',
    selector: '[data-test="title"]',
    container: '.header_secondary_container',
    textHint: 'Products',
  };
  static readonly cartLink: ElementTarget = {
    name: 'enlace al carrito de compras (ícono del carrito en el encabezado)',
    selector: '[data-test="shopping-cart-link"]',
    container: '.shopping_cart_container',
  };
  static readonly cartBadge: ElementTarget = {
    name: 'contador de productos del carrito (número sobre el ícono)',
    selector: '[data-test="shopping-cart-badge"]',
    container: '.shopping_cart_container',
  };

  constructor(
    private readonly page: Page,
    private readonly healer: SelfHealingLocator,
  ) {}

  private static productCard(productName: string): string {
    return `.inventory_item:has(.inventory_item_name:text-is("${productName}"))`;
  }

  static addToCartButton(productName: string): ElementTarget {
    return {
      name: `botón "Add to cart" del producto ${productName}`,
      selector: `[data-test="add-to-cart-${productSlug(productName)}"]`,
      container: InventoryPage.productCard(productName),
      textHint: 'Add to cart',
    };
  }

  static description(productName: string): ElementTarget {
    return {
      name: `descripción del producto ${productName}`,
      selector: `[data-test="inventory-item"]:has([data-test="inventory-item-name"]:text-is("${productName}")) [data-test="inventory-item-desc"]`,
      container: InventoryPage.productCard(productName),
    };
  }

  static price(productName: string): ElementTarget {
    return {
      name: `precio del producto ${productName}`,
      selector: `[data-test="inventory-item"]:has([data-test="inventory-item-name"]:text-is("${productName}")) [data-test="inventory-item-price"]`,
      container: InventoryPage.productCard(productName),
      textHint: '$',
    };
  }

  async goto(): Promise<void> {
    await test.step('Abrir el catálogo de productos', async () => {
      await this.page.goto('/inventory.html');
    });
  }

  async title(): Promise<string> {
    return this.healer.textOf(InventoryPage.title);
  }

  async addToCart(...productNames: string[]): Promise<void> {
    for (const productName of productNames) {
      await test.step(`Agregar "${productName}" al carrito`, async () => {
        await this.healer.click(InventoryPage.addToCartButton(productName));
      });
    }
  }

  async descriptionOf(productName: string): Promise<string> {
    return this.healer.textOf(InventoryPage.description(productName));
  }

  async priceInCentsOf(productName: string): Promise<number> {
    return toCents(await this.healer.textOf(InventoryPage.price(productName)));
  }

  async cartCount(): Promise<number> {
    return Number(await this.healer.textOf(InventoryPage.cartBadge));
  }

  async openCart(): Promise<void> {
    await test.step('Abrir el carrito', async () => {
      await this.healer.click(InventoryPage.cartLink);
      await this.page.waitForURL('**/cart.html');
    });
  }
}
