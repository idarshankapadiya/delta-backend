import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Firestore, Timestamp } from '@google-cloud/firestore';
import { ulid } from 'ulid';
import { ProductService } from '../product/product.service';
import type { ProductListItem } from '../product/product.types';
import type { CreateQuotationRequestDto } from './dto/quotation.dto';
import { QuotationNotificationService } from './quotation-notification.service';
import type {
  CartValidationIssue,
  CartValidationResponse,
  QuotationCustomer,
  QuotationLineItem,
  QuotationRequest,
  QuotationStatus,
  RequestedCartItem,
} from './quotation.types';

interface StoredQuotationRequest {
  reference?: unknown;
  status?: unknown;
  customer?: unknown;
  items?: unknown;
  totals?: unknown;
  notes?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

@Injectable()
export class QuotationService {
  private readonly logger = new Logger(QuotationService.name);
  private readonly collectionName = 'quotation_requests';
  private firestore?: Firestore;

  constructor(
    private readonly products: ProductService,
    private readonly notifications: QuotationNotificationService,
  ) {}

  async validateCart(
    items: RequestedCartItem[],
  ): Promise<CartValidationResponse> {
    const issues: CartValidationIssue[] = [];
    const seenProductIds = new Set<string>();

    for (const item of items) {
      if (seenProductIds.has(item.productId)) {
        issues.push({
          productId: item.productId,
          code: 'duplicate',
          message: 'The same product cannot appear more than once.',
        });
      }
      seenProductIds.add(item.productId);
    }

    const { products, missingProductIds } =
      await this.products.getProductsForCart([...seenProductIds]);
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );

    for (const productId of missingProductIds) {
      issues.push({
        productId,
        code: 'not_found',
        message: 'Product is no longer available.',
      });
    }

    const validatedItems = items.flatMap((item) => {
      const product = productsById.get(item.productId);
      if (!product) return [];

      if (!product.inStock) {
        issues.push({
          productId: item.productId,
          code: 'out_of_stock',
          message: `${product.name} is currently out of stock.`,
        });
      } else if (
        product.stockQuantity !== undefined &&
        item.quantity > product.stockQuantity
      ) {
        issues.push({
          productId: item.productId,
          code: 'quantity_unavailable',
          message: `Only ${product.stockQuantity} unit${product.stockQuantity === 1 ? '' : 's'} of ${product.name} are currently available.`,
        });
      }

      return [{ productId: item.productId, quantity: item.quantity, product }];
    });

    return {
      valid: issues.length === 0,
      items: validatedItems,
      issues,
      totals: this.calculateTotals(
        validatedItems.map(({ product, quantity }) =>
          this.toQuotationLineItem(product, quantity),
        ),
      ),
    };
  }

  async createQuotation(
    input: CreateQuotationRequestDto,
  ): Promise<{ ok: true; quotation: QuotationRequest }> {
    const validation = await this.validateCart(input.items);

    if (!validation.valid) {
      throw new ConflictException({
        message: 'Cart validation failed',
        issues: validation.issues,
      });
    }

    const now = new Date();
    const reference = `QUO-${ulid()}`;
    const customer = this.normalizeCustomer(input.customer);
    const items = validation.items.map(({ product, quantity }) =>
      this.toQuotationLineItem(product, quantity),
    );
    const quotation: QuotationRequest = {
      id: reference,
      reference,
      status: 'new',
      customer,
      items,
      totals: this.calculateTotals(items),
      ...(input.notes?.trim() ? { notes: input.notes.trim() } : {}),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    const stored = {
      ...quotation,
      created_at: Timestamp.fromDate(now),
      updated_at: Timestamp.fromDate(now),
    };

    await this.getCollection().doc(reference).create(stored);

    try {
      await this.notifications.notify(quotation);
    } catch (error) {
      this.logger.error(
        `Quotation ${reference} was saved but notification delivery failed`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    return { ok: true, quotation };
  }

  async getQuotations(): Promise<{ quotations: QuotationRequest[] }> {
    const snapshot = await this.getCollection()
      .orderBy('created_at', 'desc')
      .limit(200)
      .get();

    return {
      quotations: snapshot.docs.map((document) =>
        this.toQuotation(
          document.id,
          document.data() as StoredQuotationRequest,
        ),
      ),
    };
  }

  async getQuotation(quotationId: string): Promise<QuotationRequest> {
    const snapshot = await this.getCollection().doc(quotationId).get();
    if (!snapshot.exists)
      throw new NotFoundException('Quotation request not found');

    return this.toQuotation(
      snapshot.id,
      snapshot.data() as StoredQuotationRequest,
    );
  }

  async updateStatus(
    quotationId: string,
    status: QuotationStatus,
  ): Promise<{ ok: true; quotation: QuotationRequest }> {
    const reference = this.getCollection().doc(quotationId);
    const snapshot = await reference.get();
    if (!snapshot.exists)
      throw new NotFoundException('Quotation request not found');

    const updatedAt = new Date();
    await reference.update({
      status,
      updated_at: Timestamp.fromDate(updatedAt),
    });

    return {
      ok: true,
      quotation: {
        ...this.toQuotation(
          snapshot.id,
          snapshot.data() as StoredQuotationRequest,
        ),
        status,
        updated_at: updatedAt.toISOString(),
      },
    };
  }

  private normalizeCustomer(customer: QuotationCustomer): QuotationCustomer {
    return {
      name: customer.name.trim(),
      ...(customer.company?.trim() ? { company: customer.company.trim() } : {}),
      email: customer.email.trim().toLowerCase(),
      mobile: customer.mobile.trim(),
      deliveryLocation: customer.deliveryLocation.trim(),
    };
  }

  private toQuotationLineItem(
    product: ProductListItem,
    quantity: number,
  ): QuotationLineItem {
    const quotedUnitPrice = this.roundMoney(
      product.price * (1 - product.discountPercentage / 100),
    );

    return {
      productId: product.id,
      name: product.name,
      ...(product.sku ? { sku: product.sku } : {}),
      ...(product.modelNumber ? { modelNumber: product.modelNumber } : {}),
      companyName: product.company.name,
      categoryName: product.category.name,
      quantity,
      currency: product.currency,
      listUnitPrice: product.price,
      discountPercentage: product.discountPercentage,
      quotedUnitPrice,
      lineTotal: this.roundMoney(quotedUnitPrice * quantity),
    };
  }

  private calculateTotals(items: QuotationLineItem[]): Record<string, number> {
    return items.reduce<Record<string, number>>((totals, item) => {
      totals[item.currency] = this.roundMoney(
        (totals[item.currency] ?? 0) + item.lineTotal,
      );
      return totals;
    }, {});
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toQuotation(
    id: string,
    data: StoredQuotationRequest,
  ): QuotationRequest {
    const status = this.isQuotationStatus(data.status) ? data.status : 'new';
    const customer = this.objectValue(
      data.customer,
    ) as Partial<QuotationCustomer>;
    const items = Array.isArray(data.items)
      ? (data.items as QuotationLineItem[])
      : [];
    const totals = this.objectValue(data.totals) as Record<string, number>;

    return {
      id,
      reference: this.stringValue(data.reference) || id,
      status,
      customer: {
        name: this.stringValue(customer.name),
        ...(this.stringValue(customer.company)
          ? { company: this.stringValue(customer.company) }
          : {}),
        email: this.stringValue(customer.email),
        mobile: this.stringValue(customer.mobile),
        deliveryLocation: this.stringValue(customer.deliveryLocation),
      },
      items,
      totals,
      ...(this.stringValue(data.notes)
        ? { notes: this.stringValue(data.notes) }
        : {}),
      created_at: this.toIsoDate(data.created_at),
      updated_at: this.toIsoDate(data.updated_at),
    };
  }

  private isQuotationStatus(value: unknown): value is QuotationStatus {
    return ['new', 'reviewing', 'quoted', 'closed', 'cancelled'].includes(
      String(value),
    );
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value : '';
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

  private getCollection() {
    return this.getFirestore().collection(this.collectionName);
  }

  private getFirestore(): Firestore {
    if (!this.firestore) {
      const databaseId = (
        process.env.QUOTATION_FIRESTORE_DATABASE_ID ??
        process.env.FIRESTORE_DATABASE_ID
      )?.trim();
      if (!databaseId) {
        throw new ServiceUnavailableException(
          'QUOTATION_FIRESTORE_DATABASE_ID or FIRESTORE_DATABASE_ID is required',
        );
      }
      this.firestore = new Firestore({ databaseId });
    }
    return this.firestore;
  }
}
