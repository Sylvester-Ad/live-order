import { createHash, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { deleteProduct } from "../../src/modules/products/products.service.js";
import {
  releaseProductImageSlot,
  reserveProductImageSlot,
} from "../../src/modules/products/product-image-slots.service.js";
import { resetTestDatabase } from "../helpers/test-database.js";

const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");

describe("product image slot concurrency", () => {
  let creatorId: string;
  let liveId: string;
  let productId: string;

  beforeEach(async () => {
    await resetTestDatabase();
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

  function reservationInput(overrides: Partial<Parameters<typeof reserveProductImageSlot>[0]> = {}) {
    return {
      idempotencyKey: randomUUID(),
      creatorId,
      liveId,
      productId,
      fileFingerprint: fingerprint(randomUUID()),
      provider: "CLOUDINARY" as const,
      ...overrides,
    };
  }

  async function createImageWithRequest(status: "PENDING" | "COMPLETED" | "DELETED") {
    const request = await prisma.productImageUploadRequest.create({
      data: {
        idempotencyKey: randomUUID(),
        creatorId,
        liveId,
        productId,
        fileFingerprint: fingerprint("uploaded image"),
        status,
        provider: "CLOUDINARY",
        storageId: `liveorder/products/${randomUUID()}`,
      },
    });
    const image = await prisma.productImage.create({
      data: {
        productId,
        url: "https://images.example/image.png",
        storageId: request.storageId,
        provider: "CLOUDINARY",
        uploadRequestId: request.id,
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { imageSlotsUsed: 1 },
    });

    return { image, request };
  }

  async function expectIdentityConflict(
    overrides: Partial<Parameters<typeof reserveProductImageSlot>[0]>,
  ) {
    const input = reservationInput();
    await reserveProductImageSlot(input);

    await expect(reserveProductImageSlot({ ...input, ...overrides })).rejects.toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
    });
    await expect(prisma.productImageUploadRequest.count({
      where: { idempotencyKey: input.idempotencyKey },
    })).resolves.toBe(1);
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 1 });
  }

  it("allows three reservations and rejects a fourth", async () => {
    for (let index = 0; index < 3; index += 1) {
      await expect(reserveProductImageSlot(reservationInput())).resolves.toMatchObject({ kind: "reserved" });
    }

    await expect(reserveProductImageSlot(reservationInput())).rejects.toMatchObject({
      code: "PRODUCT_IMAGE_LIMIT_REACHED",
    });
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 3 });
    await expect(prisma.productImageUploadRequest.count({ where: { productId } })).resolves.toBe(3);
  });

  it("rolls back the slot increment when the upload request insert fails", async () => {
    await expect(reserveProductImageSlot(reservationInput({ fileFingerprint: "invalid" }))).rejects.toThrow();

    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 0 });
    await expect(prisma.productImageUploadRequest.count({ where: { productId } })).resolves.toBe(0);
  });

  it("never exceeds three slots when distinct keys compete for the last slot", async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { imageSlotsUsed: 2 },
    });
    await prisma.productImage.createMany({
      data: [0, 1].map((index) => ({
        productId,
        url: `https://images.example/${index}.png`,
        storageId: `legacy/${index}`,
        provider: "CLOUDINARY" as const,
        isPrimary: index === 0,
      })),
    });

    const results = await Promise.allSettled([
      reserveProductImageSlot(reservationInput()),
      reserveProductImageSlot(reservationInput()),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 3 });
  });

  it("recovers a simultaneous first-time same-key request without reserving twice", async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { imageSlotsUsed: 2 },
    });
    await prisma.productImage.createMany({
      data: [0, 1].map((index) => ({
        productId,
        url: `https://images.example/${index}.png`,
        storageId: `legacy/${index}`,
        provider: "CLOUDINARY" as const,
        isPrimary: index === 0,
      })),
    });
    const input = reservationInput();
    const results = await Promise.all([
      reserveProductImageSlot(input),
      reserveProductImageSlot(input),
    ]);

    expect(results.map(({ request }) => request.id)).toEqual([results[0].request.id, results[0].request.id]);
    expect(results.map(({ kind }) => kind).sort()).toEqual(["existing", "reserved"]);
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 3 });
    await expect(prisma.productImageUploadRequest.count({ where: { idempotencyKey: input.idempotencyKey } }))
      .resolves.toBe(1);
  });

  it("rejects a matching key with a different fingerprint without consuming a second slot", async () => {
    const input = reservationInput();
    await reserveProductImageSlot(input);

    await expect(reserveProductImageSlot({
      ...input,
      fileFingerprint: fingerprint("different file"),
    })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 1 });
  });

  it("rejects a matching key reused by a different creator", async () => {
    const otherCreator = await prisma.creator.create({
      data: { name: "Other Creator", accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`) },
    });

    await expectIdentityConflict({ creatorId: otherCreator.id });
  });

  it("rejects a matching key reused for a different Live", async () => {
    const otherLive = await prisma.live.create({
      data: { creatorId, name: "Other Live", slug: `test-${randomUUID()}` },
    });

    await expectIdentityConflict({ liveId: otherLive.id });
  });

  it("rejects a matching key reused for a different product", async () => {
    const otherProduct = await prisma.product.create({
      data: { liveId, name: "Other product", price: 2500 },
    });

    await expectIdentityConflict({ productId: otherProduct.id });
    await expect(prisma.product.findUniqueOrThrow({ where: { id: otherProduct.id } }))
      .resolves.toMatchObject({ imageSlotsUsed: 0 });
  });

  it("rejects reservations after the product deletion gate is set", async () => {
    await prisma.product.update({
      where: { id: productId },
      data: { isDeleting: true },
    });

    await expect(reserveProductImageSlot(reservationInput())).rejects.toMatchObject({
      code: "PRODUCT_DELETING",
    });
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 0 });
  });

  it("rolls back the product deletion gate when pending uploads exist", async () => {
    await reserveProductImageSlot(reservationInput());

    await expect(deleteProduct(creatorId, liveId, productId)).rejects.toMatchObject({
      code: "PENDING_IMAGE_UPLOADS",
    });
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ isDeleting: false, imageSlotsUsed: 1 });
  });

  it("serializes deletion against a new reservation", async () => {
    const input = reservationInput();
    const [reservation, deletion] = await Promise.allSettled([
      reserveProductImageSlot(input),
      deleteProduct(creatorId, liveId, productId),
    ]);

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (product) {
      expect(reservation.status).toBe("fulfilled");
      expect(deletion).toMatchObject({
        status: "rejected",
        reason: { code: "PENDING_IMAGE_UPLOADS" },
      });
      expect(product).toMatchObject({ isDeleting: false, imageSlotsUsed: 1 });
    } else {
      expect(deletion.status).toBe("fulfilled");
      expect(reservation).toMatchObject({
        status: "rejected",
        reason: { code: "PRODUCT_NOT_FOUND" },
      });
    }
  });

  it("releases an image with a completed request and transitions both records", async () => {
    const { image, request } = await createImageWithRequest("COMPLETED");

    await expect(releaseProductImageSlot(image.id)).resolves.toBe(true);
    await expect(prisma.productImage.findUniqueOrThrow({ where: { id: image.id } }))
      .resolves.toMatchObject({ state: "DELETING" });
    await expect(prisma.productImageUploadRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .resolves.toMatchObject({ status: "DELETED" });
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 0 });
  });

  it.each(["PENDING", "DELETED"] as const)(
    "rejects an active image with a %s request and rolls back all state",
    async (status) => {
      const { image, request } = await createImageWithRequest(status);

      await expect(releaseProductImageSlot(image.id)).rejects.toMatchObject({
        code: "PRODUCT_IMAGE_STATE_INCONSISTENT",
      });

      await expect(prisma.productImage.findUniqueOrThrow({ where: { id: image.id } }))
        .resolves.toMatchObject({ state: "ACTIVE" });
      await expect(prisma.productImageUploadRequest.findUniqueOrThrow({ where: { id: request.id } }))
        .resolves.toMatchObject({ status });
      await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .resolves.toMatchObject({ imageSlotsUsed: 1 });
    },
  );

  it("releases a legacy image without an upload request", async () => {
    const image = await prisma.productImage.create({
      data: {
        productId,
        url: "https://images.example/legacy.png",
        storageId: `legacy/${randomUUID()}`,
        provider: "CLOUDINARY",
      },
    });
    await prisma.product.update({
      where: { id: productId },
      data: { imageSlotsUsed: 1 },
    });

    await expect(releaseProductImageSlot(image.id)).resolves.toBe(true);
    await expect(prisma.productImage.findUniqueOrThrow({ where: { id: image.id } }))
      .resolves.toMatchObject({ state: "DELETING", uploadRequestId: null });
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 0 });
  });

  it("does not decrement the slot counter twice on repeated release", async () => {
    const { image, request } = await createImageWithRequest("COMPLETED");

    await expect(releaseProductImageSlot(image.id)).resolves.toBe(true);
    await expect(releaseProductImageSlot(image.id)).resolves.toBe(false);
    await expect(prisma.product.findUniqueOrThrow({ where: { id: productId } }))
      .resolves.toMatchObject({ imageSlotsUsed: 0 });
    await expect(prisma.productImage.findUniqueOrThrow({ where: { id: image.id } }))
      .resolves.toMatchObject({ state: "DELETING" });
    await expect(prisma.productImageUploadRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .resolves.toMatchObject({ status: "DELETED" });

    await prisma.product.delete({ where: { id: productId } });
    await expect(prisma.productImageUploadRequest.findUniqueOrThrow({ where: { id: request.id } }))
      .resolves.toMatchObject({ productId, status: "DELETED" });
    await expect(prisma.productImage.findUnique({ where: { id: image.id } })).resolves.toBeNull();
  });
});
