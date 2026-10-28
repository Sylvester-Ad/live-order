export type SupportedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export type StoredProductImage = {
  url: string;
  storageId: string;
  provider: "CLOUDINARY";
};

export interface ImageStorage {
  upload(input: { buffer: Buffer; mimeType: SupportedImageMimeType }): Promise<StoredProductImage>;
  delete(storageId: string): Promise<void>;
  deliveryUrl(storageId: string, originalUrl: string): string;
}
