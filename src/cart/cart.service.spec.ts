import { ConflictException, NotFoundException } from '@nestjs/common';
import { ProductService } from '../product/product.service';
import type { ProductListItem } from '../product/product.types';
import { CartService } from './cart.service';

describe('CartService', () => {
  const product: ProductListItem = {
    id: 'product-1',
    name: 'Circuit breaker',
    company: { id: 'company-1', name: 'Example', slug: 'example' },
    category: { id: 'category-1', name: 'Protection', slug: 'protection' },
    price: 100,
    currency: 'INR',
    discountPercentage: 10,
    inStock: true,
    stockQuantity: 5,
  };
  const products = {
    getProductsForCart: jest.fn(),
  };
  let service: CartService;

  beforeEach(() => {
    jest.clearAllMocks();
    products.getProductsForCart.mockImplementation((productIds: string[]) =>
      Promise.resolve({
        products: productIds.includes(product.id) ? [product] : [],
        missingProductIds: productIds.filter(
          (productId) => productId !== product.id,
        ),
      }),
    );
    service = new CartService(products as unknown as ProductService);
  });

  it('keeps cart contents isolated by authenticated customer ID', async () => {
    await service.setItem('customer-a', product.id, 2);
    await service.setItem('customer-b', product.id, 1);

    await expect(service.getCart('customer-a')).resolves.toMatchObject({
      customer_id: 'customer-a',
      items: [{ productId: product.id, quantity: 2 }],
    });
    await expect(service.getCart('customer-b')).resolves.toMatchObject({
      customer_id: 'customer-b',
      items: [{ productId: product.id, quantity: 1 }],
    });
  });

  it('clamps requested quantities to current stock', async () => {
    const cart = await service.setItem('customer-a', product.id, 999);

    expect(cart.items[0]?.quantity).toBe(5);
  });

  it('merges with maximum quantity semantics and remains idempotent', async () => {
    await service.setItem('customer-a', product.id, 2);
    await service.mergeCart('customer-a', [
      { productId: product.id, quantity: 4 },
    ]);
    const cart = await service.mergeCart('customer-a', [
      { productId: product.id, quantity: 3 },
      { productId: product.id, quantity: 4 },
    ]);

    expect(cart.items).toEqual([
      expect.objectContaining({ productId: product.id, quantity: 4 }),
    ]);
  });

  it('rejects missing and unavailable products', async () => {
    await expect(
      service.setItem('customer-a', 'missing-product', 1),
    ).rejects.toBeInstanceOf(NotFoundException);

    products.getProductsForCart.mockResolvedValue({
      products: [{ ...product, inStock: false }],
      missingProductIds: [],
    });
    await expect(
      service.setItem('customer-a', product.id, 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes one item or clears the entire customer cart', async () => {
    await service.setItem('customer-a', product.id, 2);
    await expect(service.removeItem('customer-a', product.id)).resolves.toEqual(
      { customer_id: 'customer-a', items: [] },
    );

    await service.setItem('customer-a', product.id, 2);
    await expect(service.clearCart('customer-a')).resolves.toEqual({
      customer_id: 'customer-a',
      items: [],
    });
  });
});
