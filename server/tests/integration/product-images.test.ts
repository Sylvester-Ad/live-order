import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";
import { uploadProductImage, removeProductImage, productImageValidation } from "../../src/modules/products/product-images.service.js";
import type { ImageStorage, StoredProductImage } from "../../src/modules/products/image-storage/image-storage.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Product image service", () => {
  let creatorId: string;
  let liveId: string;
  let productId: string;
  let storage: ImageStorage;
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let sequence: number;

  beforeEach(async () => {
    await resetTestDatabase();
    sequence = 0;
    upload = vi.fn(async () => {
      sequence += 1;
      return { url: `https://images.example/${sequence}.png`, storageId: `asset-${sequence}`, provider: "CLOUDINARY" as const };
    });
    remove = vi.fn(async () => undefined);
    storage = { upload, delete: remove };

    const creator = await prisma.creator.create({
      data: { name: "Test Creator", accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`) },
    });
    creatorId = creator.id;
    const live = await prisma.live.create({
      data: { creatorId, name: "Test Live", slug: `test-${randomUUID()}` },
    });
    liveId = live.id;
    const product = await prisma.product.create({
      data: { liveId, name: "Test product", price: 2500 },
    });
    productId = product.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("checks file signatures and MIME type before calling storage", async () => {
    await expect(uploadProductImage(creatorId, liveId, productId, {
      buffer: Buffer.from("not an image"),
      mimetype: "image/png",
    }, storage)).rejects.toMatchObject({ code: "INVALID_IMAGE_FORMAT" });
    expect(upload).not.toHaveBeenCalled();
    expect(productImageValidation.maxBytes).toBe(5 * 1024 * 1024);
  });

  it("keeps the existing image when the provider upload fails", async () => {
    const first = await uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage);
    upload.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage)).rejects.toThrow("provider unavailable");
    expect(first.image?.url).toBe("https://images.example/1.png");
    expect((await prisma.productImage.findMany({ where: { productId, isPrimary: true } })).map((image) => image.url)).toEqual([first.image?.url]);
  });

  it("uploads a replacement before removing the prior primary image", async () => {
    await uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage);
    const replaced = await uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage);

    expect(upload).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledWith("asset-1");
    expect(replaced.image?.url).toBe("https://images.example/2.png");
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
  });

  it("cleans up a new upload when its database insert fails", async () => {
    upload.mockResolvedValueOnce({
      url: "https://images.example/bad.png",
      storageId: "asset-invalid-provider",
      provider: "UNSUPPORTED" as StoredProductImage["provider"],
    });

    await expect(uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage)).rejects.toThrow();
    expect(remove).toHaveBeenCalledWith("asset-invalid-provider");
    expect(await prisma.productImage.count({ where: { productId } })).toBe(0);
  });

  it("removes the primary image and leaves the product intact", async () => {
    await uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage);
    const result = await removeProductImage(creatorId, liveId, productId, storage);

    expect(result.image).toBeNull();
    expect(remove).toHaveBeenCalledWith("asset-1");
    expect(await prisma.product.findUnique({ where: { id: productId } })).not.toBeNull();
    expect(await prisma.productImage.count({ where: { productId } })).toBe(0);
  });

  it("does not remove a displayed image when storage deletion fails", async () => {
    await uploadProductImage(creatorId, liveId, productId, { buffer: png, mimetype: "image/png" }, storage);
    remove.mockRejectedValueOnce(new Error("provider unavailable"));
    const result = await removeProductImage(creatorId, liveId, productId, storage);

    expect(result.image).toBeNull();
    expect(await prisma.productImage.findFirst({ where: { productId, isPrimary: true } })).toBeNull();
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
  });
});
