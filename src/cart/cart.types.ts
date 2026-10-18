import type { ProductListItem } from '../product/product.types';

export interface CustomerCartItem {
  productId: string;
  quantity: number;
  product: ProductListItem;
}

export interface CustomerCartResponse {
  customer_id: string;
  items: CustomerCartItem[];
}

export interface StoredCartItem {
  productId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}
