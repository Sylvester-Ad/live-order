import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Product image gallery and primary selection API", () => {
  let creatorId: string;
  let liveId: string;
  let liveSlug: string;
  let productId: string;
  let cookie: string;

  beforeEach(async () => {
    await resetTestDatabase();
    const accessCode = `LO-${randomUUID()}`;
    const creator = await prisma.creator.create({
      data: { name: "Test Creator", accessCodeHash: await hashAccessCode(accessCode) },
    });
    creatorId = creator.id;

    const login = await request(app).post("/api/v1/creator/access").send({ accessCode });
    expect(login.status).toBe(200);
    cookie = login.headers["set-cookie"][0].split(";")[0];

    const live = await prisma.live.create({
      data: {
        creatorId,
        name: "Test Live",
        slug: `test-${randomUUID()}`,
        status: "ACTIVE",
      },
    });
    liveId = live.id;
    liveSlug = live.slug;

    const product = await prisma.product.create({
      data: { liveId, name: "Test product", price: 2500, stockQuantity: 3 },
    });
    productId = product.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  async function createImage(input: {
    id?: string;
    targetProductId?: string;
    isPrimary?: boolean;
    state?: "ACTIVE" | "DELETING";
    createdAt?: Date;
  } = {}) {
    return prisma.productImage.create({
      data: {
        id: input.id ?? randomUUID(),
        productId: input.targetProductId ?? productId,
        url: `https://images.example/${input.id ?? randomUUID()}.png`,
        storageId: `provider-internal/${randomUUID()}`,
        provider: "CLOUDINARY",
        isPrimary: input.isPrimary ?? false,
        state: input.state ?? "ACTIVE",
        createdAt: input.createdAt ?? new Date(),
      },
    });
  }

  async function sellerProduct() {
    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .expect(200);
    return response.body.data.find((product: { id: string }) => product.id === productId);
  }

  async function publicProduct() {
    const response = await request(app)
      .get(`/api/v1/public/lives/${liveSlug}`)
      .expect(200);
    return response.body.data.products.find((product: { id: string }) => product.id === productId);
  }

  it("returns an empty gallery and null image alias for products without images", async () => {
    const seller = await sellerProduct();
    const customer = await publicProduct();

    expect(seller).toMatchObject({ images: [], image: null });
    expect(customer).toMatchObject({ images: [], image: null });
  });

  it("returns a one-image gallery with the primary image as its compatibility alias", async () => {
    const image = await createImage({ isPrimary: true });

    const seller = await sellerProduct();
    const customer = await publicProduct();

    for (const product of [seller, customer]) {
      expect(product.images).toHaveLength(1);
      expect(product.images[0]).toMatchObject({ id: image.id, isPrimary: true });
      expect(product.image).toEqual({
        id: product.images[0].id,
        url: product.images[0].url,
        createdAt: product.images[0].createdAt,
      });
      expect(JSON.stringify(product)).not.toContain("storageId");
      expect(JSON.stringify(product)).not.toContain("provider-internal");
    }
    expect(seller.images).toEqual(customer.images);
    expect(seller.image).toEqual(customer.image);
  });

  it("serializes active images primary-first and then by creation time and ID", async () => {
    const sameTime = new Date("2026-01-01T00:00:00.000Z");
    const primary = await createImage({
      id: randomUUID(),
      isPrimary: true,
      createdAt: new Date("2026-01-03T00:00:00.000Z"),
    });
    const laterId = await createImage({ id: "image-z", createdAt: sameTime });
    const earlierId = await createImage({ id: "image-a", createdAt: sameTime });
    const deleting = await createImage({ state: "DELETING", createdAt: new Date("2025-01-01T00:00:00.000Z") });

    const seller = await sellerProduct();
    const customer = await publicProduct();
    const expectedIds = [primary.id, earlierId.id, laterId.id];

    expect(seller.images.map((image: { id: string }) => image.id)).toEqual(expectedIds);
    expect(customer.images.map((image: { id: string }) => image.id)).toEqual(expectedIds);
    expect(seller.images.map((image: { isPrimary: boolean }) => image.isPrimary)).toEqual([true, false, false]);
    expect(seller.image.id).toBe(primary.id);
    expect(customer.image).toEqual(seller.image);
    expect(seller.images.some((image: { id: string }) => image.id === deleting.id)).toBe(false);
    expect(JSON.stringify(seller)).not.toContain("storageId");
    expect(JSON.stringify(customer)).not.toContain("provider-internal");
  });

  it("allows the owner to select another active image and returns the updated product", async () => {
    const previousPrimary = await createImage({ isPrimary: true });
    const selected = await createImage();

    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${selected.id}/primary`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body.data.image.id).toBe(selected.id);
    expect(response.body.data.images[0]).toMatchObject({ id: selected.id, isPrimary: true });
    expect(await prisma.productImage.findUnique({ where: { id: previousPrimary.id } }))
      .toMatchObject({ isPrimary: false });
    expect(await prisma.productImage.findUnique({ where: { id: selected.id } }))
      .toMatchObject({ isPrimary: true });
    expect(await prisma.productImage.count({ where: { productId, isPrimary: true, state: "ACTIVE" } })).toBe(1);
  });

  it("rejects images belonging to another product without changing the existing primary", async () => {
    const primary = await createImage({ isPrimary: true });
    const otherProduct = await prisma.product.create({
      data: { liveId, name: "Other product", price: 3000 },
    });
    const otherImage = await createImage({ targetProductId: otherProduct.id, isPrimary: true });

    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${otherImage.id}/primary`)
      .set("Cookie", cookie)
      .expect(404);

    expect(response.body.error.code).toBe("PRODUCT_IMAGE_NOT_FOUND");
    expect(await prisma.productImage.findUnique({ where: { id: primary.id } }))
      .toMatchObject({ isPrimary: true });
    expect(await prisma.productImage.findUnique({ where: { id: otherImage.id } }))
      .toMatchObject({ isPrimary: true });
  });

  it("rejects missing and non-active images without changing the current primary", async () => {
    const primary = await createImage({ isPrimary: true });
    const deleting = await createImage({ state: "DELETING" });

    const missing = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${randomUUID()}/primary`)
      .set("Cookie", cookie)
      .expect(404);
    const inactive = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${deleting.id}/primary`)
      .set("Cookie", cookie)
      .expect(409);

    expect(missing.body.error.code).toBe("PRODUCT_IMAGE_NOT_FOUND");
    expect(inactive.body.error.code).toBe("PRODUCT_IMAGE_NOT_ACTIVE");
    expect(await prisma.productImage.findUnique({ where: { id: primary.id } }))
      .toMatchObject({ isPrimary: true });
    expect(await prisma.productImage.count({ where: { productId, isPrimary: true, state: "ACTIVE" } })).toBe(1);
  });

  it("rejects unauthenticated and wrong-owner primary selection", async () => {
    const image = await createImage({ isPrimary: true });
    const unauthenticated = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${image.id}/primary`)
      .expect(401);

    const accessCode = `LO-${randomUUID()}`;
    const otherCreator = await prisma.creator.create({
      data: {
        name: "Other Creator",
        accessCodeHash: await hashAccessCode(accessCode),
      },
    });
    const otherLive = await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Other Live",
        slug: `other-${randomUUID()}`,
        status: "ACTIVE",
      },
    });
    const validOtherLogin = await request(app)
      .post("/api/v1/creator/access")
      .send({ accessCode });
    expect(validOtherLogin.status).toBe(200);
    const otherCookie = validOtherLogin.headers["set-cookie"][0].split(";")[0];

    const wrongOwner = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${image.id}/primary`)
      .set("Cookie", otherCookie)
      .expect(404);

    expect(unauthenticated.body.error.code).toBe("UNAUTHENTICATED");
    expect(wrongOwner.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(await prisma.productImage.findUnique({ where: { id: image.id } }))
      .toMatchObject({ isPrimary: true });
  });

  it("rolls back primary demotion if selecting the new primary fails", async () => {
    const currentPrimary = await createImage({ isPrimary: true });
    const target = await createImage();
    await prisma.$executeRaw`
      CREATE TRIGGER "fail_primary_image_selection"
      BEFORE UPDATE OF "isPrimary" ON "ProductImage"
      WHEN NEW."isPrimary" = true
      BEGIN SELECT RAISE(ABORT, 'injected primary selection failure'); END
    `;

    try {
      const response = await request(app)
        .patch(`/api/v1/lives/${liveId}/products/${productId}/images/${target.id}/primary`)
        .set("Cookie", cookie)
        .expect(500);
      expect(response.body.error.code).toBe("INTERNAL_SERVER_ERROR");
    } finally {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS "fail_primary_image_selection"`;
    }

    expect(await prisma.productImage.findUnique({ where: { id: currentPrimary.id } }))
      .toMatchObject({ isPrimary: true });
    expect(await prisma.productImage.findUnique({ where: { id: target.id } }))
      .toMatchObject({ isPrimary: false });
    expect(await prisma.productImage.count({ where: { productId, isPrimary: true, state: "ACTIVE" } })).toBe(1);
  });
});
