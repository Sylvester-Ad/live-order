import type { components } from "../../../types/openapi.generated";
import { api } from "../../../lib/api-client";

export type Product = components["schemas"]["ProductResponse"];
export type CreateProductInput = components["schemas"]["CreateProductRequest"];
export type UpdateProductInput = components["schemas"]["UpdateProductRequest"];

export const productsApi = {
  list(liveId: string, signal?: AbortSignal) {
    return api.get<Product[]>(`/v1/lives/${encodeURIComponent(liveId)}/products`, { signal });
  },
  create(liveId: string, input: CreateProductInput, image?: File) {
    if (!image) return api.post<Product>(`/v1/lives/${encodeURIComponent(liveId)}/products`, input);
    const form = new FormData();
    form.append("product", JSON.stringify(input));
    form.append("image", image);
    return api.post<Product>(`/v1/lives/${encodeURIComponent(liveId)}/products`, form);
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
  uploadImage(liveId: string, productId: string, file: File) {
    const form = new FormData();
    form.append("image", file);
    return api.post<Product>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}/image`,
      form,
    );
  },
  removeImage(liveId: string, productId: string) {
    return api.delete<Product>(
      `/v1/lives/${encodeURIComponent(liveId)}/products/${encodeURIComponent(productId)}/image`,
    );
  },
};
