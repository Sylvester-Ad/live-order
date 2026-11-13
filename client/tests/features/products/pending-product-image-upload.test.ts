import { afterEach, describe, expect, it } from "vitest";

import {
  clearProductImageUploadAttempt,
  findProductImageUploadAttempt,
  getOrCreateProductImageUploadKey,
  listProductImageUploadAttempts,
  pendingProductImageUploadStorageKey,
} from "../../../src/features/products/lib/pending-product-image-upload";

afterEach(() => {
  sessionStorage.clear();
});

describe("pending product image upload keys", () => {
  it("reuses a key only for the same file bytes and clears it after completion", async () => {
    const file = new File(["original bytes"], "shirt.png", { type: "image/png" });
    const key = await getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", file);

    await expect(getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", file))
      .resolves.toBe(key);
    const differentFileKey = await getOrCreateProductImageUploadKey(
      "creator-1",
      "live-1",
      "product-1",
      new File(["different bytes"], "shirt.png", { type: "image/png" }),
    );
    expect(differentFileKey).not.toBe(key);

    clearProductImageUploadAttempt("creator-1", "live-1", "product-1", key);
    expect(sessionStorage.getItem(
      pendingProductImageUploadStorageKey("creator-1", "live-1", "product-1"),
    )).not.toBeNull();
    clearProductImageUploadAttempt("creator-1", "live-1", "product-1", differentFileKey);
    expect(sessionStorage.getItem(
      pendingProductImageUploadStorageKey("creator-1", "live-1", "product-1"),
    )).toBeNull();

    const newLogicalUploadKey = await getOrCreateProductImageUploadKey(
      "creator-1",
      "live-1",
      "product-1",
      file,
    );
    expect(newLogicalUploadKey).not.toBe(key);
  });

  it("matches recovery attempts by exact bytes and MIME type without creating a key", async () => {
    const file = new File(["original bytes"], "shirt.png", { type: "image/png" });
    const key = await getOrCreateProductImageUploadKey("creator-1", "live-1", "product-1", file);

    await expect(findProductImageUploadAttempt(
      "creator-1", "live-1", "product-1",
      new File(["original bytes"], "renamed.png", { type: "image/png" }),
    )).resolves.toMatchObject({ idempotencyKey: key });
    await expect(findProductImageUploadAttempt(
      "creator-1", "live-1", "product-1",
      new File(["different bytes"], "shirt.png", { type: "image/png" }),
    )).resolves.toBeNull();
    await expect(findProductImageUploadAttempt(
      "creator-1", "live-1", "product-1",
      new File(["original bytes"], "shirt.png", { type: "image/jpeg" }),
    )).resolves.toBeNull();
    expect(listProductImageUploadAttempts("creator-1", "live-1", "product-1"))
      .toEqual([{ idempotencyKey: key, fileFingerprint: expect.any(String) }]);
  });
});
