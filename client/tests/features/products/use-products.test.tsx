import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Product } from "../../../src/features/products/api/products-api";
import {
  productImageUploadStatusQueryKey,
  productImageUploadsQueryKey,
  productsQueryKey,
  usePendingProductImageUploads,
  useProductImageUploadStatus,
  useRemoveProductImage,
  useSelectPrimaryProductImage,
  useUploadProductImage,
} from "../../../src/features/products/hooks/use-products";

function response(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("product image mutations", () => {
  const productWithImage: Product = {
    id: "product-1",
    liveId: "live-1",
    name: "Classic shirt",
    price: 2500,
    options: null,
    stockQuantity: 3,
    images: [{
      id: "image-1",
      url: "https://images.example/shirt.png",
      createdAt: null,
      isPrimary: true,
    }],
    image: {
      id: "image-1",
      url: "https://images.example/shirt.png",
      createdAt: null,
    },
    createdAt: null,
    updatedAt: null,
  };

  it("uses the nested upload product for cache updates and invalidates seller and public data", async () => {
    const originalProduct: Product = {
      id: "product-1",
      liveId: "live-1",
      name: "Classic shirt",
      price: 2500,
      options: null,
      stockQuantity: 3,
      images: [],
      image: null,
      createdAt: null,
      updatedAt: null,
    };
    const updatedProduct: Product = {
      ...originalProduct,
      images: [{
        id: "image-1",
        url: "https://images.example/shirt.png",
        createdAt: null,
        isPrimary: true,
      }],
      image: {
        id: "image-1",
        url: "https://images.example/shirt.png",
        createdAt: null,
      },
    };
    const uploadResult = {
      product: updatedProduct,
      image: updatedProduct.images[0],
    };
    const fetchMock = vi.fn(async () => response(uploadResult));
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    queryClient.setQueryData(productsQueryKey("live-1"), [originalProduct]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useUploadProductImage(), { wrapper });
    const file = new File(["shirt"], "shirt.png", { type: "image/png" });

    await act(async () => {
      await result.current.mutateAsync({
        liveId: "live-1",
        productId: "product-1",
        file,
        idempotencyKey: "c58d6a17-5790-4bfc-a0bd-859687084d34",
      });
    });

    expect(queryClient.getQueryData(productsQueryKey("live-1"))).toEqual([updatedProduct]);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: productsQueryKey("live-1"),
      exact: true,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["public-live"] });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: productImageUploadsQueryKey("live-1", "product-1"),
      exact: true,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: productImageUploadStatusQueryKey(
        "live-1",
        "c58d6a17-5790-4bfc-a0bd-859687084d34",
      ),
      exact: true,
    });
    queryClient.clear();
  });

  it("loads pending/status queries and invalidates caches after primary selection and individual removal", async () => {
    const pending = [{
      idempotencyKey: "c58d6a17-5790-4bfc-a0bd-859687084d34",
      status: "PENDING" as const,
      canResume: true as const,
      createdAt: null,
    }];
    const status = {
      ...pending[0],
      productId: "product-1",
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/image-uploads/pending")) return response(pending);
      if (url.endsWith(`/product-image-uploads/${pending[0].idempotencyKey}`)) return response(status);
      if (url.endsWith("/images/image-2/primary")) return response(productWithImage);
      if (url.endsWith("/images/image-2")) return response(productWithImage);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    queryClient.setQueryData(productsQueryKey("live-1"), [productWithImage]);
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => ({
      pending: usePendingProductImageUploads("live-1", "product-1"),
      status: useProductImageUploadStatus("live-1", pending[0].idempotencyKey),
      select: useSelectPrimaryProductImage(),
      remove: useRemoveProductImage(),
    }), { wrapper });

    await waitFor(() => {
      expect(result.current.pending.data).toEqual(pending);
      expect(result.current.status.data).toEqual(status);
    });
    expect(queryClient.getQueryData(productImageUploadsQueryKey("live-1", "product-1"))).toEqual(pending);
    expect(queryClient.getQueryData(
      productImageUploadStatusQueryKey("live-1", pending[0].idempotencyKey),
    )).toEqual(status);

    await act(async () => {
      await result.current.select.mutateAsync({
        liveId: "live-1",
        productId: "product-1",
        imageId: "image-2",
      });
      await result.current.remove.mutateAsync({
        liveId: "live-1",
        productId: "product-1",
        imageId: "image-2",
      });
    });

    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/images/image-2/primary") && init?.method === "PATCH",
    )).toBe(true);
    expect(fetchMock.mock.calls.some(([input, init]) =>
      String(input).endsWith("/images/image-2") && init?.method === "DELETE",
    )).toBe(true);
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: productsQueryKey("live-1"),
      exact: true,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["public-live"] });
    queryClient.clear();
  });
});
