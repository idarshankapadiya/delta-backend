import { CartService } from '../cart/cart.service';
import { InventoryService } from '../inventory/inventory.service';
import { getProductPricing } from '../config/pricing.config';
import { OrderService } from './order.service';
import type { CreateOrderDto } from './dto/create-order.dto';

describe('OrderService discount policy', () => {
  const values: CreateOrderDto = {
    orderRequestId: 'a24c786b-ceef-48ed-aef8-49e319220149',
    email: 'customer@example.com',
    termsAccepted: true,
    billingAddress: {
      firstName: 'Test',
      lastName: 'Customer',
      addressLine1: 'Test street',
      city: 'Pune',
      state: 'Maharashtra',
      postcode: '411001',
      phone: '9999999999',
    },
  };
  const product = {
    id: 'product-1',
    name: 'Breaker',
    price: 100,
    currency: 'INR',
    discountPercentage: 10,
  };
  const carts = { getCart: jest.fn(), clearCart: jest.fn() };
  const get = jest.fn();
  const create = jest.fn<void, [unknown, Record<string, unknown>]>();
  const transaction = { get, create };
  const reference = { get };
  let service: OrderService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, 'env', { ...process.env });
    delete process.env.VITE_DISCOUNTS_ENABLED;
    get.mockResolvedValue({ exists: false });
    carts.getCart.mockResolvedValue({
      items: [
        { product, quantity: 2 },
        {
          product: {
            ...product,
            id: 'product-2',
            price: 50,
            currency: 'USD',
            discountPercentage: 20,
          },
          quantity: 3,
        },
      ],
    });
    service = new OrderService(
      carts as unknown as CartService,
      {} as InventoryService,
    );
    (service as unknown as { firestore: unknown }).firestore = {
      collection: jest.fn(() => ({ doc: jest.fn(() => reference) })),
      runTransaction: async (
        callback: (value: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['true', 'false', undefined])(
    'stores authoritative order pricing when flag is %s',
    async (flag) => {
      if (flag !== undefined) process.env.VITE_DISCOUNTS_ENABLED = flag;
      const enabled = flag !== 'false';
      await service.createOrder('customer-1', values);
      expect(create).toHaveBeenCalledWith(
        reference,
        expect.objectContaining({
          items: [
            expect.objectContaining({
              list_unit_price: 100,
              discount_percentage: enabled ? 10 : 0,
              unit_price: enabled ? 90 : 100,
              line_total: enabled ? 180 : 200,
            }),
            expect.objectContaining({
              list_unit_price: 50,
              discount_percentage: enabled ? 20 : 0,
              unit_price: enabled ? 40 : 50,
              line_total: enabled ? 120 : 150,
            }),
          ],
          totals: {
            INR: {
              subtotal: enabled ? 180 : 200,
              shipping: 300,
              total: enabled ? 480 : 500,
            },
            USD: {
              subtotal: enabled ? 120 : 150,
              shipping: 0,
              total: enabled ? 120 : 150,
            },
          },
        }),
      );
      expect(carts.clearCart).toHaveBeenCalledWith('customer-1');
      expect(product.discountPercentage).toBe(10);

      const stored: unknown = create.mock.calls[0]?.[1];
      get.mockResolvedValue({ exists: true, data: () => stored });
      process.env.VITE_DISCOUNTS_ENABLED = enabled ? 'false' : 'true';
      await service.createOrder('customer-1', values);
      expect(create).toHaveBeenCalledTimes(1);
      expect(carts.getCart).toHaveBeenCalledTimes(1);
    },
  );

  it('handles zero and full catalog discounts in both modes', () => {
    for (const flag of ['true', 'false']) {
      process.env.VITE_DISCOUNTS_ENABLED = flag;
      expect(getProductPricing({ price: 25, discountPercentage: 0 })).toEqual({
        unitPrice: 25,
        discountPercentage: 0,
      });
      expect(getProductPricing({ price: 25, discountPercentage: 100 })).toEqual(
        {
          unitPrice: flag === 'true' ? 0 : 25,
          discountPercentage: flag === 'true' ? 100 : 0,
        },
      );
    }
  });
});
