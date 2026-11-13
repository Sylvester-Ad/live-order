import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Product = components["schemas"]["ProductResponse"];
export type CreateProductInput = components["schemas"]["CreateProductRequest"];
export type UpdateProductInput = components["schemas"]["UpdateProductRequest"];
export type ProductImageUploadResult = components["schemas"]["ProductImageUploadSuccessResponse"]["data"];
export type ProductImageUploadStatus = components["schemas"]["ProductImageUploadStatusSuccessResponse"]["data"];
export type PendingProductImageUpload =
  components["schemas"]["PendingProductImageUploadsSuccessResponse"]["data"][number];
export type ProductImage = Product["images"][number];

export const productsApi = {
  list(liveId: string, signal?: AbortSignal) {
    return api.get<Product[]>(`/v1/lives/${encodeURIComponent(liveId)}/products`, { signal });
  },
  create(liveId: string, input: CreateProductInput, idempotencyKey: string) {
    return api.post<Product>(
      `/v1/lives/${encodeURIComponent(liveId)}/products`,
      input,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  update(liveId: string, productId: string, input: UpdateProductInput) {
    return api.patch<Product>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}`,
      input,
    );
  },
  delete(liveId: string, productId: string) {
    return api.delete<void>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}`,
    );
  },
  uploadImage(liveId: string, productId: string, file: File, idempotencyKey: string) {
    const form = new FormData();
    form.append("image", file);
    return api.post<ProductImageUploadResult>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}/images`,
      form,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  listPendingImageUploads(liveId: string, productId: string, signal?: AbortSignal) {
    return api.get<PendingProductImageUpload[]>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}/image-uploads/pending`,
      { signal },
    );
  },
  getImageUploadStatus(liveId: string, idempotencyKey: string, signal?: AbortSignal) {
    return api.get<ProductImageUploadStatus>(
      `/v1/lives/${encodeURIComponent(liveId)}/product-image-uploads/${encodeURIComponent(idempotencyKey)}`,
      { signal },
    );
  },
  selectPrimaryImage(liveId: string, productId: string, imageId: string) {
    return api.patch<Product>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/primary`,
    );
  },
  removeImage(liveId: string, productId: string, imageId: string) {
    return api.delete<Product>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    );
  },
};
