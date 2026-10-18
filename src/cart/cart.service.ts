import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Firestore,
  Timestamp,
  type CollectionReference,
  type DocumentData,
  type QueryDocumentSnapshot,
} from '@google-cloud/firestore';
import { ProductService } from '../product/product.service';
import type { ProductListItem } from '../product/product.types';
import type { MergeCartItemDto } from './dto/cart.dto';
import type { CustomerCartResponse, StoredCartItem } from './cart.types';

const MAX_CART_ITEMS = 50;
const MAX_CART_QUANTITY = 999;

@Injectable()
export class CartService {
  private firestore?: Firestore;
  private readonly memoryCarts = new Map<string, Map<string, StoredCartItem>>();

  constructor(private readonly products: ProductService) {}

  async getCart(customerId: string): Promise<CustomerCartResponse> {
    const storedItems = await this.listStoredItems(customerId);
    if (storedItems.length === 0) {
      return { customer_id: customerId, items: [] };
    }

    const { products, missingProductIds } =
      await this.products.getProductsForCart(
        storedItems.map((item) => item.productId),
      );
    if (missingProductIds.length > 0) {
      await Promise.all(
        missingProductIds.map((productId) =>
          this.deleteStoredItem(customerId, productId),
        ),
      );
    }

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    return {
      customer_id: customerId,
      items: storedItems.flatMap((item) => {
        const product = productsById.get(item.productId);
        return product
          ? [
              {
                productId: item.productId,
                quantity: this.normalizeQuantity(item.quantity, product),
                product,
              },
            ]
          : [];
      }),
    };
  }

  async setItem(
    customerId: string,
    productId: string,
    quantity: number,
  ): Promise<CustomerCartResponse> {
    const product = await this.requireAvailableProduct(productId);
    const normalizedQuantity = this.normalizeQuantity(quantity, product);
    await this.setStoredItem(customerId, productId, normalizedQuantity);
    return this.getCart(customerId);
  }

  async removeItem(
    customerId: string,
    productId: string,
  ): Promise<CustomerCartResponse> {
    await this.deleteStoredItem(customerId, productId);
    return this.getCart(customerId);
  }

  async clearCart(customerId: string): Promise<CustomerCartResponse> {
    if (this.useMemoryStore()) {
      this.memoryCarts.delete(customerId);
      return { customer_id: customerId, items: [] };
    }

    const snapshot = await this.getItemsCollection(customerId).get();
    if (!snapshot.empty) {
      const batch = this.getFirestore().batch();
      snapshot.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
    return { customer_id: customerId, items: [] };
  }

  async mergeCart(
    customerId: string,
    requestedItems: MergeCartItemDto[],
  ): Promise<CustomerCartResponse> {
    const quantitiesByProduct = new Map<string, number>();
    for (const item of requestedItems) {
      quantitiesByProduct.set(
        item.productId,
        Math.max(quantitiesByProduct.get(item.productId) ?? 0, item.quantity),
      );
    }

    const productIds = [...quantitiesByProduct.keys()];
    const { products, missingProductIds } =
      await this.products.getProductsForCart(productIds);
    if (missingProductIds.length > 0) {
      throw new NotFoundException(`Product not found: ${missingProductIds[0]}`);
    }

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const normalizedItems = productIds.map((productId) => {
      const product = productsById.get(productId);
      if (!product) {
        throw new NotFoundException(`Product not found: ${productId}`);
      }
      this.assertAvailable(product);
      const requestedQuantity = quantitiesByProduct.get(productId);
      if (requestedQuantity === undefined) {
        throw new NotFoundException(`Product not found: ${productId}`);
      }
      return {
        productId,
        quantity: this.normalizeQuantity(requestedQuantity, product),
      };
    });

    await this.mergeStoredItems(customerId, normalizedItems);
    return this.getCart(customerId);
  }

  private async requireAvailableProduct(
    productId: string,
  ): Promise<ProductListItem> {
    const { products, missingProductIds } =
      await this.products.getProductsForCart([productId]);
    if (missingProductIds.length > 0 || !products[0]) {
      throw new NotFoundException('Product not found');
    }
    this.assertAvailable(products[0]);
    return products[0];
  }

  private assertAvailable(product: ProductListItem): void {
    if (!product.inStock || product.stockQuantity === 0) {
      throw new ConflictException(`${product.name} is currently out of stock.`);
    }
  }

  private normalizeQuantity(
    requestedQuantity: number,
    product: ProductListItem,
  ): number {
    const stockLimit =
      product.stockQuantity !== undefined && product.stockQuantity > 0
        ? Math.min(MAX_CART_QUANTITY, Math.floor(product.stockQuantity))
        : MAX_CART_QUANTITY;
    return Math.min(stockLimit, Math.max(1, Math.floor(requestedQuantity)));
  }

  private async listStoredItems(customerId: string): Promise<StoredCartItem[]> {
    if (this.useMemoryStore()) {
      return [...(this.memoryCarts.get(customerId)?.values() ?? [])].sort(
        (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
      );
    }

    const snapshot = await this.getItemsCollection(customerId)
      .orderBy('created_at', 'asc')
      .get();
    return snapshot.docs.map((document) => this.toStoredItem(document));
  }

  private async setStoredItem(
    customerId: string,
    productId: string,
    quantity: number,
  ): Promise<void> {
    if (this.useMemoryStore()) {
      const cart = this.getMemoryCart(customerId);
      if (!cart.has(productId) && cart.size >= MAX_CART_ITEMS) {
        throw new ConflictException(
          `A cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        );
      }
      const existing = cart.get(productId);
      const now = new Date();
      cart.set(productId, {
        productId,
        quantity,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      return;
    }

    const collection = this.getItemsCollection(customerId);
    const reference = collection.doc(productId);
    await this.getFirestore().runTransaction(async (transaction) => {
      const cart = await transaction.get(collection);
      const existing = cart.docs.find((document) => document.id === productId);
      if (!existing && cart.size >= MAX_CART_ITEMS) {
        throw new ConflictException(
          `A cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        );
      }

      const now = Timestamp.now();
      transaction.set(
        reference,
        {
          product_id: productId,
          quantity,
          created_at: (existing?.get('created_at') as unknown) ?? now,
          updated_at: now,
        },
        { merge: true },
      );
    });
  }

  private async mergeStoredItems(
    customerId: string,
    items: Array<{ productId: string; quantity: number }>,
  ): Promise<void> {
    if (this.useMemoryStore()) {
      const cart = this.getMemoryCart(customerId);
      const distinctProducts = new Set([
        ...cart.keys(),
        ...items.map((item) => item.productId),
      ]);
      if (distinctProducts.size > MAX_CART_ITEMS) {
        throw new ConflictException(
          `A cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        );
      }
      const now = new Date();
      for (const item of items) {
        const existing = cart.get(item.productId);
        cart.set(item.productId, {
          productId: item.productId,
          quantity: Math.max(existing?.quantity ?? 0, item.quantity),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        });
      }
      return;
    }

    const collection = this.getItemsCollection(customerId);
    await this.getFirestore().runTransaction(async (transaction) => {
      const cart = await transaction.get(collection);
      const existingItems = new Map(
        cart.docs.map((document) => [document.id, document]),
      );
      const distinctProducts = new Set([
        ...existingItems.keys(),
        ...items.map((item) => item.productId),
      ]);
      if (distinctProducts.size > MAX_CART_ITEMS) {
        throw new ConflictException(
          `A cart cannot contain more than ${MAX_CART_ITEMS} products.`,
        );
      }

      const now = Timestamp.now();
      for (const item of items) {
        const existing = existingItems.get(item.productId);
        const existingQuantity = Number(existing?.get('quantity') ?? 0);
        transaction.set(
          collection.doc(item.productId),
          {
            product_id: item.productId,
            quantity: Math.max(existingQuantity, item.quantity),
            created_at: (existing?.get('created_at') as unknown) ?? now,
            updated_at: now,
          },
          { merge: true },
        );
      }
    });
  }

  private async deleteStoredItem(
    customerId: string,
    productId: string,
  ): Promise<void> {
    if (this.useMemoryStore()) {
      this.memoryCarts.get(customerId)?.delete(productId);
      return;
    }
    await this.getItemsCollection(customerId).doc(productId).delete();
  }

  private getMemoryCart(customerId: string): Map<string, StoredCartItem> {
    let cart = this.memoryCarts.get(customerId);
    if (!cart) {
      cart = new Map();
      this.memoryCarts.set(customerId, cart);
    }
    return cart;
  }

  private getItemsCollection(
    customerId: string,
  ): CollectionReference<DocumentData, DocumentData> {
    return this.getFirestore()
      .collection('catalog_customers')
      .doc(customerId)
      .collection('cart_items');
  }

  private getFirestore(): Firestore {
    const databaseId = process.env.FIRESTORE_DATABASE_ID?.trim();
    if (!databaseId) {
      throw new ServiceUnavailableException(
        'FIRESTORE_DATABASE_ID is required for customer carts',
      );
    }
    this.firestore ??= new Firestore({ databaseId });
    return this.firestore;
  }

  private useMemoryStore(): boolean {
    return (
      process.env.NODE_ENV === 'test' || process.env.CART_STORE === 'memory'
    );
  }

  private toStoredItem(
    document: QueryDocumentSnapshot<DocumentData, DocumentData>,
  ): StoredCartItem {
    const storedProductId = document.get('product_id') as unknown;
    const storedQuantity = document.get('quantity') as unknown;
    const storedCreatedAt = document.get('created_at') as unknown;
    const storedUpdatedAt = document.get('updated_at') as unknown;
    return {
      productId:
        typeof storedProductId === 'string' ? storedProductId : document.id,
      quantity: Math.max(1, Number(storedQuantity ?? 1)),
      createdAt: this.toDate(storedCreatedAt),
      updatedAt: this.toDate(storedUpdatedAt),
    };
  }

  private toDate(value: unknown): Date {
    if (value instanceof Timestamp) return value.toDate();
    if (value instanceof Date) return value;
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      const date = (value as { toDate(): unknown }).toDate();
      if (date instanceof Date) return date;
    }
    return new Date(0);
  }
}
