import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DocumentData,
  FieldValue,
  Firestore,
  Timestamp,
  Transaction,
} from '@google-cloud/firestore';
import { ulid } from 'ulid';
import { getProductFirestoreDatabaseId } from '../config/product.config';
import type {
  AdjustStockDto,
  ReceiveStockDto,
  StockCountDto,
} from './dto/inventory.dto';
import {
  INVENTORY_COLLECTION,
  INVENTORY_MOVEMENT_COLLECTION,
  INVENTORY_RESERVATION_COLLECTION,
  type InventoryItem,
  type InventoryMovement,
  type InventoryMovementType,
  type InventoryStatus,
  type OrderInventoryItem,
} from './inventory.types';

type InventoryState = {
  onHand: number;
  reserved: number;
  incoming: number;
  damaged: number;
  reorderLevel: number;
};

@Injectable()
export class InventoryService {
  private firestore?: Firestore;

  async listInventory(
    lowStockOnly = false,
  ): Promise<{ data: InventoryItem[] }> {
    const firestore = this.getFirestore();
    const products = await firestore
      .collection('products')
      .where('active', '==', true)
      .get();
    const inventoryDocuments = products.empty
      ? []
      : await firestore.getAll(
          ...products.docs.map((product) =>
            firestore.collection(INVENTORY_COLLECTION).doc(product.id),
          ),
        );

    const data = products.docs
      .map((product, index) =>
        this.toInventoryItem(
          product.id,
          product.data(),
          inventoryDocuments[index]?.data(),
        ),
      )
      .filter((item) => !lowStockOnly || item.status !== 'IN_STOCK')
      .sort((left, right) => left.name.localeCompare(right.name));
    return { data };
  }

  async getInventory(productId: string): Promise<InventoryItem> {
    const firestore = this.getFirestore();
    const [product, inventory] = await firestore.getAll(
      firestore.collection('products').doc(productId),
      firestore.collection(INVENTORY_COLLECTION).doc(productId),
    );
    if (!product.exists) throw new NotFoundException('Product not found');
    return this.toInventoryItem(
      productId,
      product.data() as DocumentData,
      inventory.data(),
    );
  }

  async listMovements(
    productId?: string,
    limit = 100,
  ): Promise<{ data: InventoryMovement[] }> {
    const snapshot = await this.getFirestore()
      .collection(INVENTORY_MOVEMENT_COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(productId ? Math.min(500, Math.max(limit * 3, limit)) : limit)
      .get();
    const data = snapshot.docs
      .map((document) => this.toMovement(document.id, document.data()))
      .filter((movement) => !productId || movement.productId === productId)
      .slice(0, limit);
    return { data };
  }

  receive(input: ReceiveStockDto, actor: string): Promise<InventoryItem> {
    return this.changeOnHand(input.productId, input.quantity, {
      actor,
      type: 'PURCHASE_RECEIPT',
      reason: 'Purchase stock received',
      referenceType: 'purchase_receipt',
      referenceId: input.referenceId.trim(),
      notes: input.notes,
    });
  }

  adjust(
    productId: string,
    input: AdjustStockDto,
    actor: string,
  ): Promise<InventoryItem> {
    if (input.type === 'DAMAGE' && input.quantityDelta > 0) {
      throw new BadRequestException('Damage must reduce on-hand stock');
    }
    return this.changeOnHand(productId, input.quantityDelta, {
      actor,
      type: input.type,
      reason: input.reason.trim(),
      notes: input.notes,
      damagedDelta: input.type === 'DAMAGE' ? Math.abs(input.quantityDelta) : 0,
    });
  }

  async count(
    productId: string,
    input: StockCountDto,
    actor: string,
  ): Promise<InventoryItem> {
    const current = await this.getInventory(productId);
    const delta = input.countedQuantity - current.onHandQuantity;
    if (delta === 0) return current;
    return this.changeOnHand(productId, delta, {
      actor,
      type: 'STOCK_COUNT',
      reason: input.reason.trim(),
      notes: input.notes,
    });
  }

  async updateReorderLevel(
    productId: string,
    reorderLevel: number,
    actor: string,
  ): Promise<InventoryItem> {
    const firestore = this.getFirestore();
    const productReference = firestore.collection('products').doc(productId);
    const inventoryReference = firestore
      .collection(INVENTORY_COLLECTION)
      .doc(productId);
    await firestore.runTransaction(async (transaction) => {
      const [product, inventory] = await Promise.all([
        transaction.get(productReference),
        transaction.get(inventoryReference),
      ]);
      if (!product.exists) throw new NotFoundException('Product not found');
      const state = this.inventoryState(product.data(), inventory.data());
      transaction.set(
        inventoryReference,
        {
          ...this.inventoryRecord(state),
          reorderLevel,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor,
        },
        { merge: true },
      );
    });
    return this.getInventory(productId);
  }

  async reserveOrder(
    orderId: string,
    items: OrderInventoryItem[],
    actor: string,
  ): Promise<void> {
    await this.applyOrderOperation(orderId, items, actor, 'reserve');
  }

  async releaseOrder(
    orderId: string,
    items: OrderInventoryItem[],
    actor: string,
  ): Promise<void> {
    await this.applyOrderOperation(orderId, items, actor, 'release');
  }

  async dispatchOrder(
    orderId: string,
    items: OrderInventoryItem[],
    actor: string,
  ): Promise<void> {
    await this.applyOrderOperation(orderId, items, actor, 'dispatch');
  }

  async returnOrder(
    orderId: string,
    items: OrderInventoryItem[],
    actor: string,
  ): Promise<void> {
    await this.applyOrderOperation(orderId, items, actor, 'return');
  }

  private async changeOnHand(
    productId: string,
    quantityDelta: number,
    metadata: {
      actor: string;
      type: InventoryMovementType;
      reason: string;
      notes?: string;
      referenceType?: string;
      referenceId?: string;
      damagedDelta?: number;
    },
  ): Promise<InventoryItem> {
    const firestore = this.getFirestore();
    const productReference = firestore.collection('products').doc(productId);
    const inventoryReference = firestore
      .collection(INVENTORY_COLLECTION)
      .doc(productId);
    const movementReference = firestore
      .collection(INVENTORY_MOVEMENT_COLLECTION)
      .doc(ulid());

    await firestore.runTransaction(async (transaction) => {
      const [product, inventory] = await Promise.all([
        transaction.get(productReference),
        transaction.get(inventoryReference),
      ]);
      if (!product.exists) throw new NotFoundException('Product not found');
      const before = this.inventoryState(product.data(), inventory.data());
      const after = {
        ...before,
        onHand: before.onHand + quantityDelta,
        damaged: before.damaged + (metadata.damagedDelta ?? 0),
      };
      this.assertValidState(after);
      this.writeInventory(
        transaction,
        productReference,
        inventoryReference,
        after,
        metadata.actor,
      );
      this.writeMovement(
        transaction,
        movementReference,
        productId,
        before,
        after,
        {
          ...metadata,
          quantityDelta,
        },
      );
    });
    return this.getInventory(productId);
  }

  private async applyOrderOperation(
    orderId: string,
    items: OrderInventoryItem[],
    actor: string,
    operation: 'reserve' | 'release' | 'dispatch' | 'return',
  ): Promise<void> {
    const normalizedItems = this.normalizeOrderItems(items);
    const firestore = this.getFirestore();
    const reservationReference = firestore
      .collection(INVENTORY_RESERVATION_COLLECTION)
      .doc(orderId);
    const productReferences = normalizedItems.map((item) =>
      firestore.collection('products').doc(item.productId),
    );
    const inventoryReferences = normalizedItems.map((item) =>
      firestore.collection(INVENTORY_COLLECTION).doc(item.productId),
    );

    await firestore.runTransaction(async (transaction) => {
      const reservation = await transaction.get(reservationReference);
      const currentReservationState = this.stringValue(
        reservation.data()?.status,
      );
      if (this.orderOperationAlreadyApplied(operation, currentReservationState))
        return;
      this.assertOrderOperationState(operation, currentReservationState);

      const [products, inventories] = await Promise.all([
        transaction.getAll(...productReferences),
        transaction.getAll(...inventoryReferences),
      ]);
      products.forEach((product) => {
        if (!product.exists) {
          throw new NotFoundException(`Product ${product.id} not found`);
        }
      });

      normalizedItems.forEach((item, index) => {
        const product = products[index];
        const inventory = inventories[index];
        if (!product || !inventory) return;
        const before = this.inventoryState(product.data(), inventory.data());
        const after = { ...before };
        let type: InventoryMovementType;
        let quantityDelta = 0;
        if (operation === 'reserve') {
          after.reserved += item.quantity;
          type = 'ORDER_RESERVATION';
        } else if (operation === 'release') {
          after.reserved -= item.quantity;
          type = 'RESERVATION_RELEASE';
        } else if (operation === 'dispatch') {
          after.onHand -= item.quantity;
          after.reserved -= item.quantity;
          quantityDelta = -item.quantity;
          type = 'ORDER_DISPATCH';
        } else {
          after.onHand += item.quantity;
          quantityDelta = item.quantity;
          type = 'CUSTOMER_RETURN';
        }
        this.assertValidState(after);
        this.writeInventory(
          transaction,
          productReferences[index],
          inventoryReferences[index],
          after,
          actor,
        );
        this.writeMovement(
          transaction,
          firestore.collection(INVENTORY_MOVEMENT_COLLECTION).doc(ulid()),
          item.productId,
          before,
          after,
          {
            actor,
            type,
            quantityDelta,
            reason: `Order ${operation}`,
            referenceType: 'order',
            referenceId: orderId,
          },
        );
      });

      const nextStatus =
        operation === 'reserve'
          ? 'reserved'
          : operation === 'release'
            ? 'released'
            : operation === 'dispatch'
              ? 'dispatched'
              : 'returned';
      transaction.set(
        reservationReference,
        {
          orderId,
          items: normalizedItems,
          status: nextStatus,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actor,
          ...(reservation.exists
            ? {}
            : { createdAt: FieldValue.serverTimestamp() }),
        },
        { merge: true },
      );
    });
  }

  private writeInventory(
    transaction: Transaction,
    productReference: FirebaseFirestore.DocumentReference,
    inventoryReference: FirebaseFirestore.DocumentReference,
    state: InventoryState,
    actor: string,
  ) {
    const available = state.onHand - state.reserved;
    transaction.set(
      inventoryReference,
      {
        ...this.inventoryRecord(state),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actor,
      },
      { merge: true },
    );
    transaction.update(productReference, {
      stockQuantity: available,
      inStock: available > 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  private writeMovement(
    transaction: Transaction,
    reference: FirebaseFirestore.DocumentReference,
    productId: string,
    before: InventoryState,
    after: InventoryState,
    metadata: {
      actor: string;
      type: InventoryMovementType;
      quantityDelta: number;
      reason: string;
      notes?: string;
      referenceType?: string;
      referenceId?: string;
    },
  ) {
    transaction.create(reference, {
      productId,
      type: metadata.type,
      quantityDelta: metadata.quantityDelta,
      onHandBefore: before.onHand,
      onHandAfter: after.onHand,
      reservedBefore: before.reserved,
      reservedAfter: after.reserved,
      reason: metadata.reason,
      ...(metadata.notes?.trim() ? { notes: metadata.notes.trim() } : {}),
      ...(metadata.referenceType
        ? { referenceType: metadata.referenceType }
        : {}),
      ...(metadata.referenceId ? { referenceId: metadata.referenceId } : {}),
      createdBy: metadata.actor,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  private normalizeOrderItems(
    items: OrderInventoryItem[],
  ): OrderInventoryItem[] {
    const quantities = new Map<string, number>();
    items.forEach((item) => {
      if (
        !item.productId ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        throw new BadRequestException(
          'Order contains invalid stock quantities',
        );
      }
      quantities.set(
        item.productId,
        (quantities.get(item.productId) ?? 0) + item.quantity,
      );
    });
    if (quantities.size === 0)
      throw new BadRequestException('Order has no products');
    return [...quantities].map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }

  private orderOperationAlreadyApplied(
    operation: string,
    state: string,
  ): boolean {
    return (
      (operation === 'reserve' &&
        ['reserved', 'dispatched', 'returned'].includes(state)) ||
      (operation === 'release' && state === 'released') ||
      (operation === 'dispatch' &&
        ['dispatched', 'returned'].includes(state)) ||
      (operation === 'return' && state === 'returned')
    );
  }

  private assertOrderOperationState(operation: string, state: string) {
    const valid =
      (operation === 'reserve' && (!state || state === 'released')) ||
      (operation === 'release' && state === 'reserved') ||
      (operation === 'dispatch' && state === 'reserved') ||
      (operation === 'return' && state === 'dispatched');
    if (!valid)
      throw new ConflictException(
        `Order stock cannot be ${operation}d from ${state || 'unreserved'} state`,
      );
  }

  private assertValidState(state: InventoryState) {
    if (state.onHand < 0)
      throw new ConflictException('Insufficient on-hand stock');
    if (state.reserved < 0)
      throw new ConflictException('Reserved stock cannot be negative');
    if (state.onHand - state.reserved < 0) {
      throw new ConflictException('Insufficient available stock');
    }
  }

  private inventoryState(
    product: DocumentData | undefined,
    inventory: DocumentData | undefined,
  ): InventoryState {
    const legacyStock = this.nonNegativeInteger(product?.stockQuantity);
    return {
      onHand: inventory
        ? this.nonNegativeInteger(inventory.onHandQuantity)
        : legacyStock,
      reserved: this.nonNegativeInteger(inventory?.reservedQuantity),
      incoming: this.nonNegativeInteger(inventory?.incomingQuantity),
      damaged: this.nonNegativeInteger(inventory?.damagedQuantity),
      reorderLevel: this.nonNegativeInteger(inventory?.reorderLevel),
    };
  }

  private inventoryRecord(state: InventoryState) {
    return {
      onHandQuantity: state.onHand,
      reservedQuantity: state.reserved,
      availableQuantity: state.onHand - state.reserved,
      incomingQuantity: state.incoming,
      damagedQuantity: state.damaged,
      reorderLevel: state.reorderLevel,
      version: 1,
    };
  }

  private toInventoryItem(
    productId: string,
    product: DocumentData,
    inventory: DocumentData | undefined,
  ): InventoryItem {
    const state = this.inventoryState(product, inventory);
    const available = state.onHand - state.reserved;
    return {
      productId,
      name: this.stringValue(product.name) || productId,
      ...(this.stringValue(product.sku)
        ? { sku: this.stringValue(product.sku) }
        : {}),
      ...(this.stringValue(product.modelNumber)
        ? { modelNumber: this.stringValue(product.modelNumber) }
        : {}),
      company: {
        id: this.stringValue(product.companyId),
        name: this.stringValue(product.companyName),
      },
      category: {
        id: this.stringValue(product.categoryId),
        name: this.stringValue(product.categoryName),
      },
      onHandQuantity: state.onHand,
      reservedQuantity: state.reserved,
      availableQuantity: available,
      incomingQuantity: state.incoming,
      damagedQuantity: state.damaged,
      reorderLevel: state.reorderLevel,
      status: this.inventoryStatus(available, state.reorderLevel),
      updatedAt: this.toIsoDate(inventory?.updatedAt ?? product.updatedAt),
    };
  }

  private toMovement(id: string, data: DocumentData): InventoryMovement {
    return {
      id,
      productId: this.stringValue(data.productId),
      type: this.stringValue(data.type) as InventoryMovementType,
      quantityDelta: this.integerValue(data.quantityDelta),
      onHandBefore: this.nonNegativeInteger(data.onHandBefore),
      onHandAfter: this.nonNegativeInteger(data.onHandAfter),
      reservedBefore: this.nonNegativeInteger(data.reservedBefore),
      reservedAfter: this.nonNegativeInteger(data.reservedAfter),
      ...(this.stringValue(data.referenceType)
        ? { referenceType: this.stringValue(data.referenceType) }
        : {}),
      ...(this.stringValue(data.referenceId)
        ? { referenceId: this.stringValue(data.referenceId) }
        : {}),
      reason: this.stringValue(data.reason),
      ...(this.stringValue(data.notes)
        ? { notes: this.stringValue(data.notes) }
        : {}),
      createdBy: this.stringValue(data.createdBy),
      createdAt: this.toIsoDate(data.createdAt),
    };
  }

  private inventoryStatus(
    available: number,
    reorderLevel: number,
  ): InventoryStatus {
    if (available <= 0) return 'OUT_OF_STOCK';
    if (available <= reorderLevel) return 'LOW_STOCK';
    return 'IN_STOCK';
  }

  private nonNegativeInteger(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0
      ? value
      : 0;
  }

  private integerValue(value: unknown): number {
    return typeof value === 'number' && Number.isInteger(value) ? value : 0;
  }

  private stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  private toIsoDate(value: unknown): string {
    if (value instanceof Timestamp) return value.toDate().toISOString();
    if (value instanceof Date) return value.toISOString();
    return typeof value === 'string' ? value : '';
  }

  private getFirestore(): Firestore {
    this.firestore ??= new Firestore({
      databaseId: getProductFirestoreDatabaseId(),
    });
    return this.firestore;
  }
}
