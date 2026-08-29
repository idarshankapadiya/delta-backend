export type ProductSort = 'name_asc' | 'name_desc' | 'price_asc' | 'price_desc';

export type ProductStockFilter = 'in_stock' | 'out_of_stock';

export interface ProductListQuery {
  companyId?: string;
  categoryId?: string;
  subcategoryId?: string;
  stock?: ProductStockFilter;
  search?: string;
  sort: ProductSort;
  limit: number;
  cursor?: string;
}

export interface ProductCompany {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
}

export interface ProductListItem {
  id: string;
  name: string;
  sku?: string;
  modelNumber?: string;
  company: ProductCompany;
  category: ProductCategory;
  price: number;
  currency: string;
  discountPercentage: number;
  inStock: boolean;
  thumbnailUrl?: string;
}

export interface ProductDetail extends ProductListItem {
  subcategory?: ProductCategory;
  description: string;
  specifications: Record<string, string | number | boolean | null>;
  mainImageUrl?: string;
  additionalImageUrls: string[];
  brochureUrl?: string;
  catalog?: {
    id?: string;
    name?: string;
    page?: string | number;
    sourceFile?: string;
  };
}

export interface ProductListResponse {
  data: ProductListItem[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface ProductCollectionResponse<T> {
  data: T[];
}
