export type CatalogAction = 'preview' | 'download';

export interface CatalogMetadata {
  size?: number;
  sizeLabel?: string;
  contentType?: string;
  createdAt?: string;
  updatedAt?: string;
  updatedLabel?: string;
}

export interface CatalogStorageObject {
  name: string;
  size?: string | number;
  contentType?: string;
  createdAt?: string;
  updatedAt?: string;
  customMetadata?: Record<string, string>;
}

export interface SignedDocumentAccess {
  document_id: string;
  url: string;
  expires_at: string;
  ttl_seconds: number;
  file_name: string;
}

export interface CatalogDocumentRevision {
  document_id: string;
  object_name: string;
  file_name: string;
  size: number;
  content_type: string;
  updated_at?: string;
  company_slug?: string;
  category_slug?: string;
  document_slug?: string;
  display_name?: string;
  thumbnail_url?: string;
}

export interface CatalogDocumentSummary {
  document_id: string;
  company_slug: string;
  company_name: string;
  category_slug?: string;
  category_name?: string;
  document_slug: string;
  display_name: string;
  thumbnail_url?: string;
  metadata?: CatalogMetadata;
}

export interface CatalogNavigationCategory {
  category_slug: string;
  category_name: string;
  documents: CatalogDocumentSummary[];
}

export interface CatalogNavigationCompany {
  company_slug: string;
  company_name: string;
  document_count: number;
  categories: CatalogNavigationCategory[];
  documents: CatalogDocumentSummary[];
}

export interface CatalogNavigationResponse {
  companies: CatalogNavigationCompany[];
}

export interface CatalogLibraryCompany {
  company_slug: string;
  company_name: string;
  document_count: number;
  examples: CatalogDocumentSummary[];
}

export interface CatalogLibraryResponse {
  companies: CatalogLibraryCompany[];
}
