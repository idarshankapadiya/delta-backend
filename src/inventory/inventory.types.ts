export const INVENTORY_COLLECTION = 'product_inventory';
export const INVENTORY_MOVEMENT_COLLECTION = 'inventory_movements';
export const INVENTORY_RESERVATION_COLLECTION = 'inventory_order_reservations';

export type InventoryMovementType =
  | 'OPENING_BALANCE'
  | 'PURCHASE_RECEIPT'
  | 'ORDER_RESERVATION'
  | 'RESERVATION_RELEASE'
  | 'ORDER_DISPATCH'
  | 'CUSTOMER_RETURN'
  | 'DAMAGE'
  | 'MANUAL_ADJUSTMENT'
  | 'STOCK_COUNT';

export type InventoryStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

export interface InventoryItem {
  productId: string;
  name: string;
  sku?: string;
  modelNumber?: string;
  company: { id: string; name: string };
  category: { id: string; name: string };
  onHandQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  incomingQuantity: number;
  damagedQuantity: number;
  reorderLevel: number;
  status: InventoryStatus;
  updatedAt: string;
}

export interface InventoryMovement {
  id: string;
  productId: string;
  type: InventoryMovementType;
  quantityDelta: number;
  onHandBefore: number;
  onHandAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  referenceType?: string;
  referenceId?: string;
  reason: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
}

export interface OrderInventoryItem {
  productId: string;
  quantity: number;
}
