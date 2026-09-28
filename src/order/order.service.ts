import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  Firestore,
  Timestamp,
  type DocumentData,
} from '@google-cloud/firestore';
import { ulid } from 'ulid';
import { CartService } from '../cart/cart.service';
import type {
  CreateOrderDto,
  CreateOrderResponseDto,
  OrderAddressDto,
} from './dto/create-order.dto';

const ORDER_DATABASE_ID = 'client-orders-db';
const ORDER_COLLECTION = 'customer_orders';
const INR_SHIPPING_RATE = 300;

type StoredOrderResponse = {
  order_id: string;
  reference: string;
  status: string;
  payment_status: string;
  created_at: Timestamp;
};

export type BusinessOrderAddress = {
  firstName: string;
  lastName: string;
  company?: string;
  gstNumber?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postcode: string;
  phone: string;
  country: string;
  countryCode: string;
};

export type BusinessOrderLineItem = {
  productId: string;
  name: string;
  sku?: string;
  modelNumber?: string;
  quantity: number;
  listUnitPrice: number;
  discountPercentage: number;
  unitPrice: number;
  lineTotal: number;
  currency: string;
};

export type BusinessOrder = {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  customerId: string;
  customerEmail: string;
  billingAddress: BusinessOrderAddress;
  shippingAddress: BusinessOrderAddress;
  items: BusinessOrderLineItem[];
  totals: Record<string, { subtotal: number; shipping: number; total: number }>;
  notes?: string;
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class OrderService {
  private firestore?: Firestore;

  constructor(private readonly carts: CartService) {}

  async getOrders(): Promise<{ orders: BusinessOrder[] }> {
    const snapshot = await this.getFirestore()
      .collection(ORDER_COLLECTION)
      .orderBy('created_at', 'desc')
      .limit(200)
      .get();

    return {
      orders: snapshot.docs.map((document) =>
        this.toBusinessOrder(document.id, document.data()),
      ),
    };
  }

  async createOrder(
    customerId: string,
    values: CreateOrderDto,
  ): Promise<CreateOrderResponseDto> {
    if (!values.termsAccepted) {
      throw new BadRequestException('The website terms must be accepted.');
    }

    const orderReference = this.getFirestore()
      .collection(ORDER_COLLECTION)
      .doc(values.orderRequestId);
    const existing = await orderReference.get();
    if (existing.exists) {
      return this.toResponse(customerId, existing.data());
    }

    const cart = await this.carts.getCart(customerId);
    if (cart.items.length === 0) {
      throw new BadRequestException('The cart is empty.');
    }

    const createdAt = Timestamp.now();
    const reference = `DE-${ulid(createdAt.toMillis())}`;
    const totals: Record<
      string,
      { subtotal: number; shipping: number; total: number }
    > = {};
    const items = cart.items.map(({ product, quantity }) => {
      const unitPrice = product.price * (1 - product.discountPercentage / 100);
      const lineTotal = unitPrice * quantity;
      const currencyTotal = totals[product.currency] ?? {
        subtotal: 0,
        shipping: product.currency === 'INR' ? INR_SHIPPING_RATE : 0,
        total: 0,
      };
      currencyTotal.subtotal += lineTotal;
      currencyTotal.total = currencyTotal.subtotal + currencyTotal.shipping;
      totals[product.currency] = currencyTotal;

      return {
        product_id: product.id,
        name: product.name,
        ...(product.sku ? { sku: product.sku } : {}),
        ...(product.modelNumber ? { model_number: product.modelNumber } : {}),
        quantity,
        list_unit_price: product.price,
        discount_percentage: product.discountPercentage,
        unit_price: unitPrice,
        line_total: lineTotal,
        currency: product.currency,
      };
    });

    const storedResponse = await this.getFirestore().runTransaction(
      async (transaction) => {
        const concurrentOrder = await transaction.get(orderReference);
        if (concurrentOrder.exists) {
          const data = concurrentOrder.data();
          this.assertOrderOwner(customerId, data);
          return data as StoredOrderResponse;
        }

        const response: StoredOrderResponse = {
          order_id: values.orderRequestId,
          reference,
          status: 'placed',
          payment_status: 'pending',
          created_at: createdAt,
        };
        transaction.create(orderReference, {
          ...response,
          customer_id: customerId,
          customer_email: values.email.trim().toLowerCase(),
          billing_address: this.normalizeAddress(values.billingAddress),
          shipping_address: this.normalizeAddress(
            values.shippingAddress ?? values.billingAddress,
          ),
          items,
          totals,
          ...(values.notes?.trim() ? { notes: values.notes.trim() } : {}),
          payment_method: 'offline_pending',
          terms_accepted: true,
          updated_at: createdAt,
        });
        return response;
      },
    );

    await this.carts.clearCart(customerId);
    return this.toResponse(customerId, {
      ...storedResponse,
      customer_id: customerId,
    });
  }

  private normalizeAddress(address: OrderAddressDto) {
    return {
      first_name: address.firstName.trim(),
      last_name: address.lastName.trim(),
      ...(address.company?.trim() ? { company: address.company.trim() } : {}),
      ...(address.gstNumber?.trim()
        ? { gst_number: address.gstNumber.trim().toUpperCase() }
        : {}),
      address_line_1: address.addressLine1.trim(),
      ...(address.addressLine2?.trim()
        ? { address_line_2: address.addressLine2.trim() }
        : {}),
      city: address.city.trim(),
      state: address.state.trim(),
      postcode: address.postcode,
      phone: address.phone,
      country: 'India',
      country_code: 'IN',
    };
  }

  private toResponse(
    customerId: string,
    data: DocumentData | undefined,
  ): CreateOrderResponseDto {
    this.assertOrderOwner(customerId, data);
    const createdAt = data?.created_at as unknown;
    if (!(createdAt instanceof Timestamp)) {
      throw new ServiceUnavailableException('The stored order is invalid.');
    }
    return {
      ok: true,
      order_id: String(data?.order_id),
      reference: String(data?.reference),
      status: String(data?.status),
      payment_status: String(data?.payment_status),
      created_at: createdAt.toDate().toISOString(),
    };
  }

  private assertOrderOwner(
    customerId: string,
    data: DocumentData | undefined,
  ): void {
    if (!data || data.customer_id !== customerId) {
      throw new ForbiddenException(
        'The order request belongs to another customer.',
      );
    }
  }

  private toBusinessOrder(id: string, data: DocumentData): BusinessOrder {
    const billingAddress = this.toBusinessAddress(data.billing_address);
    const shippingAddress = this.toBusinessAddress(data.shipping_address);
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const rawTotals = this.objectValue(data.totals);

    return {
      id,
      reference: this.stringValue(data.reference) || id,
      status: this.stringValue(data.status) || 'placed',
      paymentStatus: this.stringValue(data.payment_status) || 'pending',
      customerId: this.stringValue(data.customer_id),
      customerEmail: this.stringValue(data.customer_email),
      billingAddress,
      shippingAddress: Object.keys(shippingAddress).some(
        (key) => shippingAddress[key as keyof BusinessOrderAddress],
      )
        ? shippingAddress
        : billingAddress,
      items: rawItems.map((value) => {
        const item = this.objectValue(value);
        return {
          productId: this.stringValue(item.product_id),
          name: this.stringValue(item.name),
          ...(this.stringValue(item.sku)
            ? { sku: this.stringValue(item.sku) }
            : {}),
          ...(this.stringValue(item.model_number)
            ? { modelNumber: this.stringValue(item.model_number) }
            : {}),
          quantity: this.numberValue(item.quantity),
          listUnitPrice: this.numberValue(item.list_unit_price),
          discountPercentage: this.numberValue(item.discount_percentage),
          unitPrice: this.numberValue(item.unit_price),
          lineTotal: this.numberValue(item.line_total),
          currency: this.stringValue(item.currency) || 'INR',
        };
      }),
      totals: Object.fromEntries(
        Object.entries(rawTotals).map(([currency, value]) => {
          const total = this.objectValue(value);
          return [
            currency,
            {
              subtotal: this.numberValue(total.subtotal),
              shipping: this.numberValue(total.shipping),
              total: this.numberValue(total.total),
            },
          ];
        }),
      ),
      ...(this.stringValue(data.notes)
        ? { notes: this.stringValue(data.notes) }
        : {}),
      paymentMethod: this.stringValue(data.payment_method) || 'offline_pending',
      createdAt: this.toIsoDate(data.created_at),
      updatedAt: this.toIsoDate(data.updated_at),
    };
  }

  private toBusinessAddress(value: unknown): BusinessOrderAddress {
    const address = this.objectValue(value);
    return {
      firstName: this.stringValue(address.first_name),
      lastName: this.stringValue(address.last_name),
      ...(this.stringValue(address.company)
        ? { company: this.stringValue(address.company) }
        : {}),
      ...(this.stringValue(address.gst_number)
        ? { gstNumber: this.stringValue(address.gst_number) }
        : {}),
      addressLine1: this.stringValue(address.address_line_1),
      ...(this.stringValue(address.address_line_2)
        ? { addressLine2: this.stringValue(address.address_line_2) }
        : {}),
      city: this.stringValue(address.city),
      state: this.stringValue(address.state),
      postcode: this.stringValue(address.postcode),
      phone: this.stringValue(address.phone),
      country: this.stringValue(address.country),
      countryCode: this.stringValue(address.country_code),
    };
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }

  private numberValue(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  }

  private toIsoDate(value: unknown): string {
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    if (
      typeof value === 'object' &&
      value !== null &&
      'toDate' in value &&
      typeof (value as { toDate?: unknown }).toDate === 'function'
    ) {
      const date = (value as { toDate(): unknown }).toDate();
      return date instanceof Date ? date.toISOString() : '';
    }
    return typeof value === 'string' ? value : '';
  }

  private getFirestore(): Firestore {
    this.firestore ??= new Firestore({
      databaseId:
        process.env.ORDER_FIRESTORE_DATABASE_ID?.trim() || ORDER_DATABASE_ID,
    });
    return this.firestore;
  }
}
