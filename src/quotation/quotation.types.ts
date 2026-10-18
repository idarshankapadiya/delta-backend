import type { ProductListItem } from '../product/product.types';

export type QuotationStatus =
  | 'new'
  | 'reviewing'
  | 'quoted'
  | 'closed'
  | 'cancelled';

export interface QuotationCustomer {
  name: string;
  company?: string;
  email: string;
  mobile: string;
  deliveryLocation: string;
}

export interface RequestedCartItem {
  productId: string;
  quantity: number;
}

export interface ValidatedCartItem {
  productId: string;
  quantity: number;
  product: ProductListItem;
}

export interface CartValidationIssue {
  productId: string;
  code: 'duplicate' | 'not_found' | 'out_of_stock' | 'quantity_unavailable';
  message: string;
}

export interface CartValidationResponse {
  valid: boolean;
  items: ValidatedCartItem[];
  issues: CartValidationIssue[];
  totals: Record<string, number>;
}

export interface QuotationLineItem {
  productId: string;
  name: string;
  sku?: string;
  modelNumber?: string;
  companyName: string;
  categoryName: string;
  quantity: number;
  currency: string;
  listUnitPrice: number;
  discountPercentage: number;
  quotedUnitPrice: number;
  lineTotal: number;
}

export interface QuotationRequest {
  id: string;
  reference: string;
  status: QuotationStatus;
  customer: QuotationCustomer;
  items: QuotationLineItem[];
  totals: Record<string, number>;
  notes?: string;
  created_at: string;
  updated_at: string;
}
