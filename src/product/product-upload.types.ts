export interface ProductUploadFile {
  buffer: Buffer;
  contentType: string;
  extension: string;
  filename: string;
}

export interface ProductUploadFiles {
  thumbnail?: ProductUploadFile;
  mainImage?: ProductUploadFile;
  additionalImages?: ProductUploadFile[];
  brochure?: ProductUploadFile;
}

export interface ProductAssetReference {
  bucket: string;
  path: string;
}

export interface UploadedProductAssets {
  thumbnail?: ProductAssetReference;
  mainImage?: ProductAssetReference;
  additionalImages?: ProductAssetReference[];
  brochure?: ProductAssetReference;
}
