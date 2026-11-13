import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "../../../src/lib/api-client";
import { productsApi } from "../../../src/features/products/api/products-api";

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("product image API", () => {
  it("uploads multipart image data with the supplied idempotency key and returns the upload wrapper", async () => {
    const uploadResult = {
      product: { id: "product-1", images: [], image: null },
      image: { id: "image-1", url: "https://images.example/image.png", createdAt: null },
    };
    const fetchMock = vi.fn(async () => response({ data: uploadResult }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["image bytes"], "shirt.png", { type: "image/png" });

    await expect(productsApi.uploadImage("live-1", "product-1", file, "upload-key"))
      .resolves.toEqual(uploadResult);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/v1/lives/live-1/products/product-1/images");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Idempotency-Key")).toBe("upload-key");
    expect(init?.body).toBeInstanceOf(FormData);
    expect((init?.body as FormData).get("image")).toBe(file);
  });

  it("lists pending uploads and looks up upload status at the documented endpoints", async () => {
    const pending = [{
      idempotencyKey: "c58d6a17-5790-4bfc-a0bd-859687084d34",
      status: "PENDING",
      canResume: true,
      createdAt: null,
    }];
    const status = {
      ...pending[0],
      productId: "product-1",
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: pending }))
      .mockResolvedValueOnce(response({ data: status }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(productsApi.listPendingImageUploads("live-1", "product-1")).resolves.toEqual(pending);
    await expect(productsApi.getImageUploadStatus("live-1", pending[0].idempotencyKey)).resolves.toEqual(status);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v1/lives/live-1/products/product-1/image-uploads/pending",
    );
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      `/v1/lives/live-1/product-image-uploads/${pending[0].idempotencyKey}`,
    );
  });

  it("selects a primary image and removes an individual image", async () => {
    const updatedProduct = { id: "product-1", images: [], image: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ data: updatedProduct }))
      .mockResolvedValueOnce(response({ data: updatedProduct }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(productsApi.selectPrimaryImage("live-1", "product-1", "image-1"))
      .resolves.toEqual(updatedProduct);
    await expect(productsApi.removeImage("live-1", "product-1", "image-2"))
      .resolves.toEqual(updatedProduct);

    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/v1/lives/live-1/products/product-1/images/image-1/primary",
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      "/v1/lives/live-1/products/product-1/images/image-2",
    );
    expect(fetchMock.mock.calls[1][1]?.method).toBe("DELETE");
  });

  it("preserves normalized API errors for image operations", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      response({ error: { code: "PRODUCT_IMAGE_LIMIT_REACHED", message: "Image limit reached" } }, 409),
    ));

    await expect(productsApi.listPendingImageUploads("live-1", "product-1"))
      .rejects.toMatchObject<ApiError>({
        name: "ApiError",
        status: 409,
        code: "PRODUCT_IMAGE_LIMIT_REACHED",
        message: "Image limit reached",
      });
  });
});
