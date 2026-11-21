import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Product = components["schemas"]["StoreProductResponse"];
export type CreateProductInput = components["schemas"]["CreateProductRequest"];
export type UpdateProductInput = components["schemas"]["UpdateProductRequest"];
export type ProductImageUploadResult = components["schemas"]["StoreProductImageUploadSuccessResponse"]["data"];
export type ProductImageUploadStatus = components["schemas"]["ProductImageUploadStatusSuccessResponse"]["data"];
export type PendingProductImageUpload =
  components["schemas"]["PendingProductImageUploadsSuccessResponse"]["data"][number];
export type ProductImage = Product["images"][number];

export const productsApi = {
  list(storeId: string, signal?: AbortSignal) {
    return api.get<Product[]>(`/v1/stores/${encodeURIComponent(storeId)}/products`, { signal });
  },
  create(storeId: string, input: CreateProductInput, idempotencyKey: string) {
    return api.post<Product>(
      `/v1/stores/${encodeURIComponent(storeId)}/products`,
      input,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  update(storeId: string, productId: string, input: UpdateProductInput) {
    return api.patch<Product>(
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
      input,
    );
  },
  delete(storeId: string, productId: string) {
    return api.delete<void>(
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}`,
    );
  },
  uploadImage(storeId: string, productId: string, file: File, idempotencyKey: string) {
    const form = new FormData();
    form.append("image", file);
    return api.post<ProductImageUploadResult>(
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/images`,
      form,
      { headers: { "Idempotency-Key": idempotencyKey } },
    );
  },
  listPendingImageUploads(storeId: string, productId: string, signal?: AbortSignal) {
    return api.get<PendingProductImageUpload[]>(
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/image-uploads/pending`,
      { signal },
    );
  },
  getImageUploadStatus(storeId: string, idempotencyKey: string, signal?: AbortSignal) {
    return api.get<ProductImageUploadStatus>(
      `/v1/stores/${encodeURIComponent(storeId)}/product-image-uploads/${encodeURIComponent(idempotencyKey)}`,
      { signal },
    );
  },
  selectPrimaryImage(storeId: string, productId: string, imageId: string) {
    return api.patch<Product>(
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/primary`,
    );
  },
  removeImage(storeId: string, productId: string, imageId: string) {
    return api.delete<Product>(
      `/v1/stores/${encodeURIComponent(storeId)}/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`,
    );
  },
};
