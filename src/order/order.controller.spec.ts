import { ConflictException } from '@nestjs/common';
import type { CatalogAuthenticatedRequest } from '../catalog/catalog-access.guard';
import type { CatalogAccessSessionSummary } from '../catalog/catalog-access.service';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

describe('OrderController', () => {
  const orders = {
    getCustomerOrders: jest.fn(),
  };
  let controller: OrderController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OrderController(orders as unknown as OrderService);
  });

  it('lists orders using ownership from the authenticated session', async () => {
    orders.getCustomerOrders.mockResolvedValue({ orders: [] });

    await controller.getOrders(createRequest('customer-a', 'customer-a'));

    expect(orders.getCustomerOrders).toHaveBeenCalledWith('customer-a');
  });

  it('rejects a stale expected-customer guard without reading orders', () => {
    expect(() =>
      controller.getOrders(createRequest('customer-b', 'customer-a')),
    ).toThrow(ConflictException);
    expect(orders.getCustomerOrders).not.toHaveBeenCalled();
  });
});

function createRequest(
  customerId: string,
  expectedCustomerId: string,
): CatalogAuthenticatedRequest {
  const catalogSession: CatalogAccessSessionSummary = {
    customerId,
    authProvider: 'google',
    email: 'customer@example.com',
    name: 'Customer',
    expiresAt: new Date('2026-09-27T00:00:00.000Z'),
  };
  return {
    catalogSession,
    headers: { 'x-expected-customer-id': expectedCustomerId },
  } as unknown as CatalogAuthenticatedRequest;
}
