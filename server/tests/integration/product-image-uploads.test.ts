import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { cloudinaryStorage } from "../../src/modules/products/image-storage/cloudinary-storage.js";
import { releaseProductImageSlot } from "../../src/modules/products/product-image-slots.service.js";
import { AppError } from "../../src/shared/errors/app-error.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Idempotent product image uploads API", () => {
  let creatorId: string;
  let liveId: string;
  let productId: string;
  let cookie: string;
  let upload: ReturnType<typeof vi.spyOn>;
  let providerAssets: Map<string, Buffer>;

  beforeEach(async () => {
    await resetTestDatabase();
    providerAssets = new Map();
    upload = vi.spyOn(cloudinaryStorage, "upload").mockImplementation(async ({ storageId, buffer }) => {
      providerAssets.set(storageId, Buffer.from(buffer));
      return {
        url: `https://images.example/${storageId}.png`,
        storageId,
        provider: "CLOUDINARY",
      };
    });

    const accessCode = `LO-${randomUUID()}`;
    const creator = await prisma.creator.create({
      data: { name: "Test Creator", accessCodeHash: await hashAccessCode(accessCode) },
    });
    creatorId = creator.id;

    const login = await request(app).post("/api/v1/creator/access").send({ accessCode });
    expect(login.status).toBe(200);
    cookie = login.headers["set-cookie"][0].split(";")[0];

    const live = await request(app)
      .post("/api/v1/lives")
      .set("Cookie", cookie)
      .send({ name: "Test Live" });
    expect(live.status).toBe(201);
    liveId = live.body.data.id;

    const product = await prisma.product.create({
      data: { liveId, name: "Test product", price: 2500 },
    });
    productId = product.id;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetTestDatabase();
  });

  function uploadRequest(
    key = randomUUID(),
    file = png,
    targetLiveId = liveId,
    targetProductId = productId,
    authCookie = cookie,
  ) {
    return request(app)
      .post(`/api/v1/lives/${targetLiveId}/products/${targetProductId}/images`)
      .set("Cookie", authCookie)
      .set("Idempotency-Key", key)
      .attach("image", file, { filename: "image.png", contentType: "image/png" });
  }

  it("uploads and finalizes an image without exposing the provider storage ID", async () => {
    const key = randomUUID();
    const response = await uploadRequest(key);

    expect(response.status).toBe(201);
    expect(response.body.data.image).toMatchObject({
      url: expect.stringContaining("liveorder/product-image-uploads/"),
    });
    expect(JSON.stringify(response.body)).not.toContain("storageId");
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });
    const uploadRequestRecord = await prisma.productImageUploadRequest.findUnique({
      where: { idempotencyKey: key },
    });
    expect(uploadRequestRecord).toMatchObject({
      status: "COMPLETED",
      storageId: expect.stringMatching(/^liveorder\/product-image-uploads\/[0-9a-f-]{36}$/),
    });
    expect(uploadRequestRecord?.storageId).not.toContain(key);
    expect(uploadRequestRecord?.storageId).toBe(upload.mock.calls[0][0].storageId);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
    expect(providerAssets.size).toBe(1);
  });

  it("does not target a legacy provider asset identifier supplied as the idempotency key", async () => {
    const key = randomUUID();
    const legacyStorageId = `liveorder/products/${key}`;
    const legacyAsset = Buffer.from("legacy asset");
    providerAssets.set(legacyStorageId, legacyAsset);

    const response = await uploadRequest(key);
    const savedRequest = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });

    expect(response.status).toBe(201);
    expect(savedRequest.storageId).not.toBe(legacyStorageId);
    expect(savedRequest.storageId).toMatch(/^liveorder\/product-image-uploads\/[0-9a-f-]{36}$/);
    expect(providerAssets.get(legacyStorageId)).toBe(legacyAsset);
    expect(providerAssets.size).toBe(2);
  });

  it("assigns different provider identifiers to different upload requests", async () => {
    const firstKey = randomUUID();
    const secondKey = randomUUID();

    expect((await uploadRequest(firstKey)).status).toBe(201);
    expect((await uploadRequest(secondKey)).status).toBe(201);

    const first = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { idempotencyKey: firstKey },
    });
    const second = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { idempotencyKey: secondKey },
    });
    expect(first.storageId).not.toBe(second.storageId);
  });

  it("rejects invalid file contents before reserving a slot", async () => {
    const response = await uploadRequest(randomUUID(), Buffer.from("not an image"));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_IMAGE_FORMAT");
    expect(upload).not.toHaveBeenCalled();
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("rejects a MIME mismatch and uploads containing more than one file before reservation", async () => {
    const mimeMismatch = await request(app)
      .post(`/api/v1/lives/${liveId}/products/${productId}/images`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .attach("image", png, { filename: "image.jpg", contentType: "image/jpeg" });
    expect(mimeMismatch.status).toBe(400);
    expect(mimeMismatch.body.error.code).toBe("INVALID_IMAGE_FORMAT");

    const multipleFiles = await request(app)
      .post(`/api/v1/lives/${liveId}/products/${productId}/images`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", randomUUID())
      .attach("image", png, { filename: "first.png", contentType: "image/png" })
      .attach("image", png, { filename: "second.png", contentType: "image/png" });
    expect(multipleFiles.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("rejects an image exceeding five megabytes before reserving a slot", async () => {
    const response = await uploadRequest(randomUUID(), Buffer.concat([
      png,
      Buffer.alloc(5 * 1024 * 1024),
    ]));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("IMAGE_TOO_LARGE");
    expect(upload).not.toHaveBeenCalled();
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it.each([
    ["missing", undefined],
    ["invalid", "not-a-uuid"],
  ])("rejects a %s idempotency key before reserving", async (_label, key) => {
    let req = request(app)
      .post(`/api/v1/lives/${liveId}/products/${productId}/images`)
      .set("Cookie", cookie);
    if (key !== undefined) req = req.set("Idempotency-Key", key);
    const response = await req.attach("image", png, { filename: "image.png", contentType: "image/png" });

    expect(response.status).toBe(400);
    expect(upload).not.toHaveBeenCalled();
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("returns the same image for a retry with the same key and content", async () => {
    const key = randomUUID();
    const first = await uploadRequest(key);
    const retry = await uploadRequest(key);

    expect(first.status).toBe(201);
    expect(retry.status).toBe(200);
    expect(retry.body.data.image.id).toBe(first.body.data.image.id);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });
    expect(upload).toHaveBeenCalledTimes(1);
    const savedRequest = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(upload.mock.calls[0][0].storageId).toBe(savedRequest.storageId);
    expect(savedRequest.storageId).toMatch(/^liveorder\/product-image-uploads\/[0-9a-f-]{36}$/);
    expect(providerAssets.size).toBe(1);
  });

  it("conflicts when a completed key is reused with different file content", async () => {
    const key = randomUUID();
    await uploadRequest(key);
    const response = await uploadRequest(key, Buffer.concat([png, Buffer.from([1])]));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });
  });

  it("conflicts when a key is reused for a different product", async () => {
    const key = randomUUID();
    await uploadRequest(key);
    const otherProduct = await prisma.product.create({
      data: { liveId, name: "Other product", price: 2500 },
    });

    const response = await uploadRequest(key, png, liveId, otherProduct.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.product.findUnique({ where: { id: otherProduct.id } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("conflicts when a key is reused under a different Live owned by the creator", async () => {
    const key = randomUUID();
    await uploadRequest(key);
    const otherLive = await prisma.live.create({
      data: { creatorId, name: "Other Live", slug: `other-${randomUUID()}` },
    });
    const otherProduct = await prisma.product.create({
      data: { liveId: otherLive.id, name: "Other product", price: 2500 },
    });

    const response = await uploadRequest(key, png, otherLive.id, otherProduct.id);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.product.findUnique({ where: { id: otherProduct.id } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("conflicts when a key is reused by another creator", async () => {
    const key = randomUUID();
    await uploadRequest(key);
    const otherCode = `LO-${randomUUID()}`;
    const otherCreator = await prisma.creator.create({
      data: { name: "Other Creator", accessCodeHash: await hashAccessCode(otherCode) },
    });
    const otherLogin = await request(app).post("/api/v1/creator/access").send({ accessCode: otherCode });
    const otherCookie = otherLogin.headers["set-cookie"][0].split(";")[0];
    const otherLive = await prisma.live.create({
      data: { creatorId: otherCreator.id, name: "Other Live", slug: `other-${randomUUID()}` },
    });
    const otherProduct = await prisma.product.create({
      data: { liveId: otherLive.id, name: "Other product", price: 2500 },
    });

    const response = await uploadRequest(key, png, otherLive.id, otherProduct.id, otherCookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.product.findUnique({ where: { id: otherProduct.id } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("reserves three image slots and rejects a fourth upload", async () => {
    for (let index = 0; index < 3; index += 1) {
      expect((await uploadRequest()).status).toBe(201);
    }

    const fourth = await uploadRequest();
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe("PRODUCT_IMAGE_LIMIT_REACHED");
    expect(upload).toHaveBeenCalledTimes(3);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 3 });
    expect(await prisma.productImage.count({ where: { productId } })).toBe(3);
  });

  it("concurrent retries share one deterministic provider asset and image row", async () => {
    const key = randomUUID();
    const [first, retry] = await Promise.all([uploadRequest(key), uploadRequest(key)]);

    expect([first.status, retry.status].sort()).toEqual([200, 201]);
    expect(first.body.data.image.id).toBe(retry.body.data.image.id);
    expect(upload.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(upload.mock.calls.length).toBeLessThanOrEqual(2);
    const savedRequest = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(upload.mock.calls.every(([input]) => input.storageId === savedRequest.storageId)).toBe(true);
    expect(providerAssets.size).toBe(1);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
    expect(await prisma.productImageUploadRequest.count({ where: { idempotencyKey: key } })).toBe(1);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });
  });

  it("keeps a provider failure pending and exposes status and pending recovery", async () => {
    upload.mockRejectedValueOnce(new AppError(502, "IMAGE_STORAGE_FAILED", "Provider unavailable"));
    const key = randomUUID();
    const failed = await uploadRequest(key);

    expect(failed.status).toBe(502);
    expect(await prisma.productImageUploadRequest.findUnique({ where: { idempotencyKey: key } }))
      .toMatchObject({ status: "PENDING" });
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 1 });

    const status = await request(app)
      .get(`/api/v1/lives/${liveId}/product-image-uploads/${key}`)
      .set("Cookie", cookie);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({ status: "PENDING", canResume: true, productId });
    expect(JSON.stringify(status.body)).not.toContain("storageId");

    const pending = await request(app)
      .get(`/api/v1/lives/${liveId}/products/${productId}/image-uploads/pending`)
      .set("Cookie", cookie);
    expect(pending.status).toBe(200);
    expect(pending.body.data).toEqual([
      expect.objectContaining({ idempotencyKey: key, status: "PENDING", canResume: true }),
    ]);

    const recovered = await uploadRequest(key);
    expect(recovered.status).toBe(200);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
  });

  it("recovers a provider success after database finalization fails", async () => {
    const key = randomUUID();
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "fail_product_image_finalize"
      BEFORE INSERT ON "ProductImage"
      BEGIN SELECT RAISE(ABORT, 'injected finalization failure'); END
    `);

    try {
      const failed = await uploadRequest(key);
      expect(failed.status).toBe(503);
      expect(failed.body.error.code).toBe("IMAGE_FINALIZATION_PENDING");
      expect(providerAssets.size).toBe(1);
      expect(await prisma.productImageUploadRequest.findUnique({ where: { idempotencyKey: key } }))
        .toMatchObject({ status: "PENDING" });
      expect(await prisma.product.findUnique({ where: { id: productId } }))
        .toMatchObject({ imageSlotsUsed: 1 });
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS "fail_product_image_finalize"');
    }

    const recovered = await uploadRequest(key);
    expect(recovered.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(2);
    const savedRequest = await prisma.productImageUploadRequest.findUniqueOrThrow({
      where: { idempotencyKey: key },
    });
    expect(upload.mock.calls.every(([input]) => input.storageId === savedRequest.storageId)).toBe(true);
    expect(providerAssets.size).toBe(1);
    expect(await prisma.productImage.count({ where: { productId } })).toBe(1);
  });

  it("returns completed status with the saved image result", async () => {
    const key = randomUUID();
    const uploaded = await uploadRequest(key);
    const status = await request(app)
      .get(`/api/v1/lives/${liveId}/product-image-uploads/${key}`)
      .set("Cookie", cookie);

    expect(uploaded.status).toBe(201);
    expect(status.status).toBe(200);
    expect(status.body.data).toMatchObject({
      status: "COMPLETED",
      canResume: false,
      image: { id: uploaded.body.data.image.id },
    });
    expect(JSON.stringify(status.body)).not.toContain("storageId");
  });

  it("returns 410 for deleted upload keys and never uploads them again", async () => {
    const key = randomUUID();
    const uploaded = await uploadRequest(key);
    const imageId = uploaded.body.data.image.id;
    await releaseProductImageSlot(imageId);

    const status = await request(app)
      .get(`/api/v1/lives/${liveId}/product-image-uploads/${key}`)
      .set("Cookie", cookie);
    const retry = await uploadRequest(key);

    expect(status.status).toBe(410);
    expect(status.body.error.code).toBe("IDEMPOTENCY_RESULT_DELETED");
    expect(retry.status).toBe(410);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(await prisma.productImage.count({ where: { id: imageId } })).toBe(1);
    expect(await prisma.productImageUploadRequest.findUnique({ where: { idempotencyKey: key } }))
      .toMatchObject({ status: "DELETED" });
  });

  it("marks completed upload tombstones when the product is deleted", async () => {
    const key = randomUUID();
    await uploadRequest(key);
    vi.spyOn(cloudinaryStorage, "delete").mockResolvedValue(undefined);

    const deleted = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${productId}`)
      .set("Cookie", cookie);
    const status = await request(app)
      .get(`/api/v1/lives/${liveId}/product-image-uploads/${key}`)
      .set("Cookie", cookie);

    expect(deleted.status).toBe(204);
    expect(status.status).toBe(410);
    expect(status.body.error.code).toBe("IDEMPOTENCY_RESULT_DELETED");
    expect(await prisma.productImageUploadRequest.findUnique({ where: { idempotencyKey: key } }))
      .toMatchObject({ status: "DELETED" });
  });

  it("preserves a legacy primary image when appending an image", async () => {
    const legacy = await prisma.productImage.create({
      data: {
        productId,
        url: "https://images.example/legacy.png",
        storageId: `legacy/${randomUUID()}`,
        provider: "CLOUDINARY",
        isPrimary: true,
      },
    });
    await prisma.product.update({ where: { id: productId }, data: { imageSlotsUsed: 1 } });

    const response = await uploadRequest();

    expect(response.status).toBe(201);
    expect(response.body.data.product.image.id).toBe(legacy.id);
    expect(await prisma.productImage.count({ where: { productId, state: "ACTIVE" } })).toBe(2);
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 2 });
  });

  it("retires the old unkeyed upload route", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/products/${productId}/image`)
      .set("Cookie", cookie);

    expect(response.status).toBe(410);
    expect(response.body.error.code).toBe("IDEMPOTENT_IMAGE_UPLOAD_REQUIRED");
    expect(upload).not.toHaveBeenCalled();
    expect(await prisma.product.findUnique({ where: { id: productId } }))
      .toMatchObject({ imageSlotsUsed: 0 });
  });

  it("requires authentication and scopes upload recovery to the creator", async () => {
    const key = randomUUID();
    const unauthenticated = await request(app)
      .get(`/api/v1/lives/${liveId}/product-image-uploads/${key}`);
    expect(unauthenticated.status).toBe(401);

    const unknown = await request(app)
      .get(`/api/v1/lives/${liveId}/product-image-uploads/${key}`)
      .set("Cookie", cookie);
    expect(unknown.status).toBe(404);

    const otherCreatorCode = `LO-${randomUUID()}`;
    const otherCreator = await prisma.creator.create({
      data: { name: "Other Creator", accessCodeHash: await hashAccessCode(otherCreatorCode) },
    });
    const otherLive = await prisma.live.create({
      data: { creatorId: otherCreator.id, name: "Other Live", slug: `other-${randomUUID()}` },
    });
    const otherProduct = await prisma.product.create({
      data: { liveId: otherLive.id, name: "Other product", price: 2500 },
    });
    const otherLogin = await request(app)
      .post("/api/v1/creator/access")
      .send({ accessCode: otherCreatorCode });
    const otherCookie = otherLogin.headers["set-cookie"][0].split(";")[0];

    const keyConflict = await uploadRequest(key);
    expect(keyConflict.status).toBe(201);
    const notOwnedStatus = await request(app)
      .get(`/api/v1/lives/${otherLive.id}/product-image-uploads/${key}`)
      .set("Cookie", otherCookie);
    expect(notOwnedStatus.status).toBe(404);

    const pendingList = await request(app)
      .get(`/api/v1/lives/${otherLive.id}/products/${otherProduct.id}/image-uploads/pending`)
      .set("Cookie", cookie);
    expect(pendingList.status).toBe(404);
  });
});
