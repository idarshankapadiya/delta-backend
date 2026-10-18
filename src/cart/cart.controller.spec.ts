import { ConflictException } from '@nestjs/common';
import type { CatalogAuthenticatedRequest } from '../catalog/catalog-access.guard';
import type { CatalogAccessSessionSummary } from '../catalog/catalog-access.service';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

describe('CartController', () => {
  const carts = {
    getCart: jest.fn(),
    setItem: jest.fn(),
  };
  let controller: CartController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CartController(carts as unknown as CartService);
  });

  it('always derives cart ownership from the authenticated session', async () => {
    carts.getCart.mockResolvedValue({ customer_id: 'customer-a', items: [] });

    await controller.getCart(createRequest('customer-a'), 'customer-a');

    expect(carts.getCart).toHaveBeenCalledWith('customer-a');
  });

  it('rejects a stale expected-customer guard without accessing a cart', () => {
    expect(() =>
      controller.getCart(createRequest('customer-b'), 'customer-a'),
    ).toThrow(ConflictException);
    expect(carts.getCart).not.toHaveBeenCalled();
  });

  it('passes validated mutations to the authenticated customer cart', async () => {
    carts.setItem.mockResolvedValue({ customer_id: 'customer-a', items: [] });

    await controller.setItem(
      createRequest('customer-a'),
      'customer-a',
      { productId: 'product-1' },
      { quantity: 3 },
    );

    expect(carts.setItem).toHaveBeenCalledWith('customer-a', 'product-1', 3);
  });
});

function createRequest(customerId: string): CatalogAuthenticatedRequest {
  const catalogSession: CatalogAccessSessionSummary = {
    customerId,
    authProvider: 'google',
    email: 'customer@example.com',
    name: 'Customer',
    expiresAt: new Date('2026-09-27T00:00:00.000Z'),
  };
  return { catalogSession } as unknown as CatalogAuthenticatedRequest;
}
