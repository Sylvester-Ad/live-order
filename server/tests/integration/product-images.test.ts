import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import {
  removeProductImage,
  removeProductImageById,
  productImageValidation,
  selectPrimaryProductImage,
} from "../../src/modules/products/product-images.service.js";
import type { ImageStorage } from "../../src/modules/products/image-storage/image-storage.js";
import { resetTestDatabase } from "../helpers/test-database.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
const { routeDelete } = vi.hoisted(() => ({
  routeDelete: vi.fn(async (_storageId: string) => undefined),
}));

vi.mock("../../src/modules/products/image-storage/index.js", () => ({
  getImageStorage: () => ({
    upload: vi.fn(),
    delete: routeDelete,
    deliveryUrl: (_storageId: string, url: string) => url,
  }),
}));

describe("Product image removal foundation", () => {
  let creatorId: string;
  let liveId: string;
  let productId: string;
  let cookie: string;
  let storage: ImageStorage;
  let remove: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await resetTestDatabase();
    routeDelete.mockReset().mockResolvedValue(undefined);
    remove = vi.fn(async () => undefined);
    storage = {
      upload: vi.fn(async ({ storageId }) => ({
        url: `https://images.example/${storageId}.png`,
        storageId,
        provider: "CLOUDINARY" as const,
      })),
      delete: remove,
      deliveryUrl: (_storageId, url) => url,
    };

    const accessCode = `LO-${randomUUID()}`;
    const creator = await prisma.creator.create({
      data: { name: "Test Creator", accessCodeHash: await hashAccessCode(accessCode) },
    });
    creatorId = creator.id;
    const login = await request(app).post("/api/v1/creator/access").send({ accessCode });
    expect(login.status).toBe(200);
    cookie = login.headers["set-cookie"][0].split(";")[0];
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

  async function createLegacyImage() {
    const image = await prisma.productImage.create({
      data: {
        productId,
        url: "https://images.example/legacy.png",
        storageId: `legacy/${randomUUID()}`,
        provider: "CLOUDINARY",
        isPrimary: true,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { imageSlotsUsed: 1 },
    });
    return image;
  }

  async function createImage(input: {
    isPrimary?: boolean;
    createdAt?: Date;
    state?: "ACTIVE" | "DELETING";
    withCompletedRequest?: boolean;
  } = {}) {
    let uploadRequestId: string | undefined;
    if (input.withCompletedRequest) {
      const uploadRequest = await prisma.productImageUploadRequest.create({
        data: {
          idempotencyKey: randomUUID(),
          creatorId,
          liveId,
          productId,
          fileFingerprint: fingerprint(randomUUID()),
          status: "COMPLETED",
          provider: "CLOUDINARY",
          storageId: `liveorder/product-image-uploads/${randomUUID()}`,
        },
      });
      uploadRequestId = uploadRequest.id;
    }

    const image = await prisma.productImage.create({
      data: {
        productId,
        url: `https://images.example/${randomUUID()}.png`,
        storageId: `image/${randomUUID()}`,
        provider: "CLOUDINARY",
        isPrimary: input.isPrimary ?? false,
        state: input.state ?? "ACTIVE",
        ...(input.createdAt && { createdAt: input.createdAt }),
        ...(uploadRequestId && { uploadRequestId }),
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { imageSlotsUsed: { increment: 1 } },
    });
    return image;
  }

  it("checks file signatures and MIME type before any provider can be used", () => {
    expect(() => productImageValidation.identifyImageFormat(Buffer.from("invalid"), "image/png"))
      .toThrowError();
    expect(productImageValidation.maxBytes).toBe(5 * 1024 * 1024);
    expect(productImageValidation.identifyImageFormat(png, "image/png")).toBe("image/png");
  });

  it("removes a legacy primary image and releases its slot", async () => {
    const image = await createLegacyImage();

    const result = await removeProductImage(creatorId, liveId, productId, storage);

    expect(result.image).toBeNull();
    expect(remove).toHaveBeenCalledWith(image.storageId);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
    expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
  });

  it("retains a failed provider deletion as non-active and releases its slot once", async () => {
    const image = await createLegacyImage();
    remove.mockRejectedValueOnce(new Error("provider unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await removeProductImage(creatorId, liveId, productId, storage);

    expect(result.image).toBeNull();
    expect(await prisma.productImage.findUnique({ where: { id: image.id } }))
      .toMatchObject({ state: "DELETING", isPrimary: false });
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
    log.mockRestore();
  });

  it("removes a non-primary image without changing the existing primary", async () => {
    const primary = await createImage({ isPrimary: true });
    const secondary = await createImage();

    const response = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${productId}/images/${secondary.id}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.image.id).toBe(primary.id);
    expect(response.body.data.images.map((image: { id: string }) => image.id)).toEqual([primary.id]);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });
    expect(await prisma.productImage.findUnique({ where: { id: secondary.id } })).toBeNull();
    expect(routeDelete).toHaveBeenCalledWith(secondary.storageId);
  });

  it("retains a removed image asset when an order has a historical snapshot", async () => {
    const image = await createImage({ isPrimary: true });
    const order = await prisma.order.create({
      data: {
        liveId,
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        totalAmount: 2500,
        items: {
          create: {
            productId,
            productName: "Test product",
            productImageUrl: image.url,
            unitPrice: 2500,
            quantity: 1,
          },
        },
      },
      include: { items: true },
    });

    await removeProductImageById(creatorId, liveId, productId, image.id, storage);

    expect(remove).not.toHaveBeenCalled();
    expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
    expect(await prisma.orderItem.findUnique({ where: { id: order.items[0]!.id } }))
      .toMatchObject({ productImageUrl: image.url });
  });

  it("promotes the earliest remaining active image when the primary is removed", async () => {
    const primary = await createImage({
      isPrimary: true,
      createdAt: new Date("2026-03-03T00:00:00.000Z"),
    });
    const later = await createImage({ createdAt: new Date("2026-03-02T00:00:00.000Z") });
    const earliest = await createImage({ createdAt: new Date("2026-03-01T00:00:00.000Z") });

    const result = await removeProductImageById(creatorId, liveId, productId, primary.id, storage);

    expect(result.image?.id).toBe(earliest.id);
    expect(result.images.map((image) => image.id)).toEqual([earliest.id, later.id]);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 2 });
    expect(await prisma.productImage.count({ where: { productId, state: "ACTIVE", isPrimary: true } })).toBe(1);
  });

  it("leaves the product without a primary when its last image is removed", async () => {
    const image = await createImage({ isPrimary: true });

    const result = await removeProductImageById(creatorId, liveId, productId, image.id, storage);

    expect(result).toMatchObject({ images: [], image: null });
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
    expect(await prisma.productImage.count({ where: { productId, isPrimary: true } })).toBe(0);
  });

  it("keeps the legacy endpoint targeting the current primary image", async () => {
    const primary = await createImage({ isPrimary: true });
    const secondary = await createImage();

    const response = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${productId}/image`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.image.id).toBe(secondary.id);
    expect(await prisma.productImage.findUnique({ where: { id: primary.id } })).toBeNull();
    expect(await prisma.productImage.findUnique({ where: { id: secondary.id } }))
      .toMatchObject({ isPrimary: true, state: "ACTIVE" });
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });
  });

  it("rejects images from another product and requests from another creator", async () => {
    const image = await createImage({ isPrimary: true });
    const otherProduct = await prisma.product.create({
      data: { liveId, name: "Other product", price: 2500 },
    });

    const wrongProduct = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${otherProduct.id}/images/${image.id}`)
      .set("Cookie", cookie)
      .expect(404);
    expect(wrongProduct.body.error.code).toBe("PRODUCT_IMAGE_NOT_FOUND");

    const accessCode = `LO-${randomUUID()}`;
    const otherCreator = await prisma.creator.create({
      data: { name: "Other creator", accessCodeHash: await hashAccessCode(accessCode) },
    });
    await prisma.live.create({
      data: { creatorId: otherCreator.id, name: "Other live", slug: `other-${randomUUID()}` },
    });
    const login = await request(app).post("/api/v1/creator/access").send({ accessCode });
    expect(login.status).toBe(200);
    const otherCookie = login.headers["set-cookie"][0].split(";")[0];
    const wrongOwner = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${productId}/images/${image.id}`)
      .set("Cookie", otherCookie)
      .expect(404);

    expect(wrongOwner.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(await prisma.productImage.findUnique({ where: { id: image.id } }))
      .toMatchObject({ state: "ACTIVE", isPrimary: true });
  });

  it("retries cleanup for a DELETING image without releasing its slot or transitioning its request again", async () => {
    const image = await createImage({ isPrimary: true, withCompletedRequest: true });
    const uploadRequest = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { id: image.uploadRequestId! },
    });
    remove.mockRejectedValueOnce(new Error("provider unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await removeProductImageById(creatorId, liveId, productId, image.id, storage);
    expect(await prisma.productImageUploadRequest.findUnique({ where: { id: uploadRequest.id } }))
      .toMatchObject({ status: "DELETED" });

    await prisma.$executeRaw`
      CREATE TRIGGER "fail_upload_request_retransition"
      BEFORE UPDATE OF "status" ON "ProductImageUploadRequest"
      WHEN OLD."status" = 'DELETED'
      BEGIN SELECT RAISE(ABORT, 'upload request transition repeated'); END
    `;
    try {
      await removeProductImageById(creatorId, liveId, productId, image.id, storage);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS "fail_upload_request_retransition"`;
      log.mockRestore();
    }

    expect(remove).toHaveBeenCalledTimes(2);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
    expect(await prisma.productImageUploadRequest.findUnique({ where: { id: uploadRequest.id } }))
      .toMatchObject({ status: "DELETED" });
    expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
  });

  it("recovers a provider-success/database-delete failure on a later removal request", async () => {
    const image = await createImage({ isPrimary: true });
    await prisma.$executeRaw`
      CREATE TRIGGER "fail_product_image_row_delete"
      BEFORE DELETE ON "ProductImage"
      BEGIN SELECT RAISE(ABORT, 'injected row deletion failure'); END
    `;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await removeProductImageById(creatorId, liveId, productId, image.id, storage);
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS "fail_product_image_row_delete"`;
      log.mockRestore();
    }

    expect(await prisma.productImage.findUnique({ where: { id: image.id } }))
      .toMatchObject({ state: "DELETING", isPrimary: false });
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });

    await removeProductImageById(creatorId, liveId, productId, image.id, storage);

    expect(remove).toHaveBeenCalledTimes(2);
    expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("does not double-release the slot under concurrent removal requests", async () => {
    const image = await createImage({ isPrimary: true, withCompletedRequest: true });

    const results = await Promise.all([
      removeProductImageById(creatorId, liveId, productId, image.id, storage),
      removeProductImageById(creatorId, liveId, productId, image.id, storage),
    ]);

    expect(results).toHaveLength(2);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
    expect(await prisma.productImageUploadRequest.findUnique({ where: { id: image.uploadRequestId! } }))
      .toMatchObject({ status: "DELETED" });
    expect(await prisma.productImage.findUnique({ where: { id: image.id } })).toBeNull();
  });

  it("serializes concurrent removal and primary selection without leaving an invalid primary", async () => {
    const primary = await createImage({ isPrimary: true });
    const other = await createImage();

    const results = await Promise.allSettled([
      removeProductImageById(creatorId, liveId, productId, primary.id, storage),
      selectPrimaryProductImage(creatorId, liveId, productId, primary.id),
    ]);

    const remaining = await prisma.productImage.findMany({
      where: { productId, state: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: other.id, isPrimary: true });
    expect(await prisma.productImage.count({ where: { productId, isPrimary: true } })).toBe(1);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
  });
});
