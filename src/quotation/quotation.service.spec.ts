import { Timestamp } from '@google-cloud/firestore';
import { ConflictException } from '@nestjs/common';
import { ProductService } from '../product/product.service';
import type { ProductListItem } from '../product/product.types';
import { QuotationNotificationService } from './quotation-notification.service';
import { QuotationService } from './quotation.service';

describe('QuotationService', () => {
  const product: ProductListItem = {
    id: 'product-1',
    name: 'Circuit breaker',
    sku: 'CB-1',
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
  const notifications = {
    notify: jest.fn(),
  };
  const create = jest.fn<Promise<void>, [unknown]>();
  const doc = jest.fn(() => ({ create }));
  const collection = { doc };
  let service: QuotationService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(process, 'env', { ...process.env });
    delete process.env.VITE_DISCOUNTS_ENABLED;
    products.getProductsForCart.mockResolvedValue({
      products: [product],
      missingProductIds: [],
    });
    create.mockResolvedValue(undefined);
    notifications.notify.mockResolvedValue(undefined);
    service = new QuotationService(
      products as unknown as ProductService,
      notifications as unknown as QuotationNotificationService,
    );
    (service as unknown as { firestore: unknown }).firestore = {
      collection: jest.fn(() => collection),
    };
  });

  afterEach(() => jest.restoreAllMocks());

  it.each(['true', 'false', undefined])(
    'uses the server discount policy (%s) for validation and saved quotations',
    async (flag) => {
      if (flag !== undefined) process.env.VITE_DISCOUNTS_ENABLED = flag;
      const enabled = flag !== 'false';
      const secondProduct = {
        ...product,
        id: 'product-2',
        price: 50,
        currency: 'USD',
        discountPercentage: 20,
      };
      products.getProductsForCart.mockResolvedValue({
        products: [product, secondProduct],
        missingProductIds: [],
      });
      const items = [
        { productId: product.id, quantity: 2 },
        { productId: secondProduct.id, quantity: 3 },
      ];
      const totals = { INR: enabled ? 180 : 200, USD: enabled ? 120 : 150 };
      const validation = await service.validateCart(items);
      expect(validation.totals).toEqual(totals);
      expect(validation.items[0].product.discountPercentage).toBe(10);
      const result = await service.createQuotation({
        customer: {
          name: 'Customer',
          email: 'customer@example.com',
          mobile: '9999999999',
          deliveryLocation: 'Pune',
        },
        items,
      });
      expect(result.quotation.totals).toEqual(totals);
      expect(result.quotation.items[0]).toMatchObject({
        listUnitPrice: 100,
        discountPercentage: enabled ? 10 : 0,
        quotedUnitPrice: enabled ? 90 : 100,
        lineTotal: totals.INR,
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ totals, items: result.quotation.items }),
      );
      expect(notifications.notify).toHaveBeenCalledWith(result.quotation);
    },
  );

  it('calculates authoritative discounted totals from backend products', async () => {
    await expect(
      service.validateCart([{ productId: 'product-1', quantity: 2 }]),
    ).resolves.toMatchObject({
      valid: true,
      totals: { INR: 180 },
      items: [
        {
          productId: 'product-1',
          quantity: 2,
          product,
        },
      ],
    });
  });

  it('rejects missing, duplicate, out-of-stock, and excessive quantities', async () => {
    products.getProductsForCart.mockResolvedValue({
      products: [
        {
          ...product,
          stockQuantity: 1,
        },
        {
          ...product,
          id: 'product-2',
          name: 'Unavailable product',
          inStock: false,
        },
      ],
      missingProductIds: ['missing-product'],
    });

    const result = await service.validateCart([
      { productId: 'product-1', quantity: 2 },
      { productId: 'product-1', quantity: 1 },
      { productId: 'product-2', quantity: 1 },
      { productId: 'missing-product', quantity: 1 },
    ]);

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'duplicate',
        'not_found',
        'out_of_stock',
        'quantity_unavailable',
      ]),
    );
  });

  it('stores a normalized immutable quotation snapshot and sends a notification', async () => {
    const result = await service.createQuotation({
      customer: {
        name: ' Customer ',
        company: ' Factory ',
        email: ' CUSTOMER@EXAMPLE.COM ',
        mobile: '9999999999',
        deliveryLocation: ' Pune ',
      },
      items: [{ productId: 'product-1', quantity: 2 }],
      notes: ' Urgent ',
    });

    expect(result.ok).toBe(true);
    expect(result.quotation.reference).toMatch(/^QUO-[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(result.quotation).toMatchObject({
      status: 'new',
      customer: {
        name: 'Customer',
        company: 'Factory',
        email: 'customer@example.com',
        deliveryLocation: 'Pune',
      },
      totals: { INR: 180 },
      notes: 'Urgent',
    });
    expect(doc).toHaveBeenCalledWith(result.quotation.reference);
    expect(create).toHaveBeenCalledTimes(1);
    const storedQuotation: unknown = create.mock.calls[0]?.[0];
    expect(storedQuotation).toMatchObject({
      reference: result.quotation.reference,
      status: 'new',
    });
    expect(
      (storedQuotation as { created_at?: unknown }).created_at,
    ).toBeInstanceOf(Timestamp);
    expect(
      (storedQuotation as { updated_at?: unknown }).updated_at,
    ).toBeInstanceOf(Timestamp);
    expect(notifications.notify).toHaveBeenCalledWith(result.quotation);
  });

  it('does not store a quotation when server validation fails', async () => {
    products.getProductsForCart.mockResolvedValue({
      products: [],
      missingProductIds: ['missing-product'],
    });

    await expect(
      service.createQuotation({
        customer: {
          name: 'Customer',
          email: 'customer@example.com',
          mobile: '9999999999',
          deliveryLocation: 'Pune',
        },
        items: [{ productId: 'missing-product', quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
