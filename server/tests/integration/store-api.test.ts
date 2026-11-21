import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { cloudinaryStorage } from "../../src/modules/products/image-storage/cloudinary-storage.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("Store-oriented API compatibility", () => {
  let creatorId: string;
  let cookie: string;
  let storeId: string;
  let slug: string;

  async function createCreatorCookie(name: string) {
    const accessCode = `LO-${randomUUID()}`;
    const creator = await prisma.creator.create({
      data: { name, accessCodeHash: await hashAccessCode(accessCode) },
    });
    const login = await request(app).post("/api/v1/creator/access").send({ accessCode }).expect(200);
    return { creatorId: creator.id, cookie: login.headers["set-cookie"][0].split(";")[0] as string };
  }

  beforeEach(async () => {
    await resetTestDatabase();
    const creator = await createCreatorCookie("Store API Creator");
    creatorId = creator.creatorId;
    cookie = creator.cookie;
    const created = await request(app)
      .post("/api/v1/stores")
      .set("Cookie", cookie)
      .send({ name: "Store API Shop" })
      .expect(201);
    storeId = created.body.data.id;
    slug = created.body.data.slug;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await resetTestDatabase();
  });

  it("creates, lists, edits, publishes, unpublishes, and republishes Stores", async () => {
    expect((await request(app).get("/api/v1/stores").set("Cookie", cookie).expect(200)).body.data)
      .toEqual([expect.objectContaining({ id: storeId, status: "DRAFT" })]);
    expect((await request(app).get(`/api/v1/stores/${storeId}`).set("Cookie", cookie).expect(200))
      .body.data).toMatchObject({ id: storeId, status: "DRAFT" });

    const edited = await request(app)
      .patch(`/api/v1/stores/${storeId}`)
      .set("Cookie", cookie)
      .send({ name: "Updated Store" })
      .expect(200);
    expect(edited.body.data.name).toBe("Updated Store");
    expect(edited.body.data.status).toBe("DRAFT");

    expect((await request(app).post(`/api/v1/stores/${storeId}/publish`).set("Cookie", cookie).expect(200))
      .body.data.status).toBe("PUBLISHED");
    expect((await request(app).post(`/api/v1/stores/${storeId}/unpublish`).set("Cookie", cookie).expect(200))
      .body.data.status).toBe("UNPUBLISHED");
    expect((await request(app).post(`/api/v1/stores/${storeId}/publish`).set("Cookie", cookie).expect(200))
      .body.data.status).toBe("PUBLISHED");
  });

  it("shares product CRUD and creation idempotency with the Live API while serializing Store fields", async () => {
    const key = randomUUID();
    const input = { name: "Canvas Bag", price: 3200, stockQuantity: 7, options: { Colour: ["Blue"] } };
    const created = await request(app)
      .post(`/api/v1/stores/${storeId}/products`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(input)
      .expect(201);
    expect(created.body.data).toMatchObject({ storeId, name: "Canvas Bag" });
    expect(created.body.data).not.toHaveProperty("liveId");

    const legacyRetry = await request(app)
      .post(`/api/v1/lives/${storeId}/products`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .send(input)
      .expect(201);
    expect(legacyRetry.body.data).toMatchObject({ liveId: storeId, id: created.body.data.id });
    expect(legacyRetry.body.data).not.toHaveProperty("storeId");
    expect(await prisma.product.count({ where: { storeId } })).toBe(1);

    const updated = await request(app)
      .patch(`/api/v1/stores/${storeId}/products/${created.body.data.id}`)
      .set("Cookie", cookie)
      .send({ stockQuantity: 4 })
      .expect(200);
    expect(updated.body.data).toMatchObject({ storeId, stockQuantity: 4 });
    expect((await request(app).get(`/api/v1/lives/${storeId}/products`).set("Cookie", cookie).expect(200))
      .body.data[0]).toMatchObject({ liveId: storeId, id: created.body.data.id });

    const secondStore = await request(app)
      .post("/api/v1/stores")
      .set("Cookie", cookie)
      .send({ name: "Second Store" })
      .expect(201);
    await request(app)
      .patch(`/api/v1/stores/${secondStore.body.data.id}/products/${created.body.data.id}`)
      .set("Cookie", cookie)
      .send({ stockQuantity: 99 })
      .expect(404);
  });

  it("shares upload idempotency and recovery across Store and Live routes", async () => {
    const upload = vi.spyOn(cloudinaryStorage, "upload").mockImplementation(async ({ storageId }) => ({
      url: `https://images.example/${storageId}.png`,
      storageId,
      provider: "CLOUDINARY",
    }));
    const remove = vi.spyOn(cloudinaryStorage, "delete").mockResolvedValue(undefined);
    const product = await prisma.product.create({ data: { storeId, name: "Photo item", price: 1200 } });
    const key = randomUUID();

    const first = await request(app)
      .post(`/api/v1/stores/${storeId}/products/${product.id}/images`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .attach("image", png, { filename: "item.png", contentType: "image/png" })
      .expect(201);
    expect(first.body.data.product.storeId).toBe(storeId);
    expect(first.body.data.product).not.toHaveProperty("liveId");

    const recovered = await request(app)
      .get(`/api/v1/lives/${storeId}/product-image-uploads/${key}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(recovered.body.data.status).toBe("COMPLETED");
    expect(recovered.body.data.image.id).toBe(first.body.data.image.id);

    const retry = await request(app)
      .post(`/api/v1/lives/${storeId}/products/${product.id}/images`)
      .set("Cookie", cookie)
      .set("Idempotency-Key", key)
      .attach("image", png, { filename: "item.png", contentType: "image/png" })
      .expect(200);
    expect(retry.body.data.image.id).toBe(first.body.data.image.id);
    expect(upload).toHaveBeenCalledTimes(1);

    const selected = await request(app)
      .patch(`/api/v1/stores/${storeId}/products/${product.id}/images/${first.body.data.image.id}/primary`)
      .set("Cookie", cookie)
      .expect(200);
    expect(selected.body.data.storeId).toBe(storeId);
    expect(selected.body.data.images[0].isPrimary).toBe(true);

    const deleted = await request(app)
      .delete(`/api/v1/stores/${storeId}/products/${product.id}/images/${first.body.data.image.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(deleted.body.data.images).toEqual([]);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("shares checkout idempotency and scopes seller order operations to the Store", async () => {
    await request(app).post(`/api/v1/stores/${storeId}/publish`).set("Cookie", cookie).expect(200);
    const product = await prisma.product.create({
      data: { storeId, name: "Order item", price: 900, stockQuantity: 5 },
    });
    const orderInput = {
      customerName: "Customer One",
      customerPhone: "0241234567",
      deliveryLocation: "Accra",
      items: [{ productId: product.id, quantity: 1 }],
    };
    const key = randomUUID();
    const first = await request(app)
      .post(`/api/v1/stores/${storeId}/orders`)
      .set("Idempotency-Key", key)
      .send(orderInput)
      .expect(201);
    expect(first.body.data.storeId).toBe(storeId);
    expect(first.body.data).not.toHaveProperty("liveId");

    const retry = await request(app)
      .post(`/api/v1/lives/${storeId}/orders`)
      .set("Idempotency-Key", key)
      .send(orderInput)
      .expect(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.liveId).toBe(storeId);
    expect(await prisma.order.count({ where: { storeId } })).toBe(1);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(4);

    const listing = await request(app).get(`/api/v1/stores/${storeId}/orders`).set("Cookie", cookie).expect(200);
    expect(listing.body.data[0]).toMatchObject({ id: first.body.data.id, storeId });
    const detail = await request(app)
      .get(`/api/v1/stores/${storeId}/orders/${first.body.data.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(detail.body.data).toMatchObject({ id: first.body.data.id, storeId });

    const secondStore = await request(app)
      .post("/api/v1/stores")
      .set("Cookie", cookie)
      .send({ name: "Another Store" })
      .expect(201);
    await request(app)
      .get(`/api/v1/stores/${secondStore.body.data.id}/orders/${first.body.data.id}`)
      .set("Cookie", cookie)
      .expect(404);
    await request(app)
      .patch(`/api/v1/stores/${secondStore.body.data.id}/orders/${first.body.data.id}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PAID" })
      .expect(404);

    const paid = await request(app)
      .patch(`/api/v1/stores/${storeId}/orders/${first.body.data.id}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PAID" })
      .expect(200);
    expect(paid.body.data.paymentStatus).toBe("PAID");

    const other = await createCreatorCookie("Order Access Outsider");
    await request(app)
      .get(`/api/v1/stores/${storeId}/orders/${first.body.data.id}`)
      .set("Cookie", other.cookie)
      .expect(404);
    await request(app)
      .patch(`/api/v1/stores/${storeId}/orders/${first.body.data.id}`)
      .set("Cookie", other.cookie)
      .send({ paymentStatus: "PAID" })
      .expect(404);

    const csv = await request(app)
      .get(`/api/v1/stores/${storeId}/orders/export`)
      .set("Cookie", cookie)
      .expect(200);
    expect(csv.headers["content-type"]).toContain("text/csv");
    expect(csv.text).toContain(first.body.data.reference);
  });

  it("serves the same public Store through both API paths and rejects cross-Creator operations", async () => {
    await request(app).get(`/api/v1/public/stores/${slug}`).expect(404);
    await request(app).post(`/api/v1/stores/${storeId}/publish`).set("Cookie", cookie).expect(200);
    const publicProduct = await prisma.product.create({
      data: { storeId, name: "Public Store Item", price: 650, stockQuantity: 2 },
    });
    const storePublic = await request(app).get(`/api/v1/public/stores/${slug}`).expect(200);
    const livePublic = await request(app).get(`/api/v1/public/lives/${slug}`).expect(200);
    expect(storePublic.body.data).toMatchObject({
      id: storeId,
      status: "PUBLISHED",
      products: [expect.objectContaining({ id: publicProduct.id })],
    });
    expect(livePublic.body.data).toMatchObject({ id: storeId, status: "ACTIVE" });

    await request(app).post(`/api/v1/stores/${storeId}/unpublish`).set("Cookie", cookie).expect(200);
    await request(app).get(`/api/v1/public/stores/${slug}`).expect(404);
    const blockedCheckout = await request(app)
      .post(`/api/v1/stores/${storeId}/orders`)
      .send({
        customerName: "Customer One",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        items: [{ productId: publicProduct.id, quantity: 1 }],
      })
      .expect(409);
    expect(blockedCheckout.body.error.code).toBe("STORE_NOT_PUBLISHED");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: publicProduct.id } })).stockQuantity)
      .toBe(2);

    const other = await createCreatorCookie("Other Creator");
    const storeDenied = await request(app)
      .get(`/api/v1/stores/${storeId}/products`)
      .set("Cookie", other.cookie)
      .expect(404);
    expect(storeDenied.body.error.code).toBe("STORE_NOT_FOUND");
    const liveDenied = await request(app)
      .get(`/api/v1/lives/${storeId}/products`)
      .set("Cookie", other.cookie)
      .expect(404);
    expect(liveDenied.body.error.code).toBe("LIVE_NOT_FOUND");
    expect(other.creatorId).not.toBe(creatorId);
  });

  it("documents Store contracts separately from the retained Live contracts", async () => {
    const docs = await request(app).get("/api-docs.json").expect(200);
    expect(docs.body.paths).toHaveProperty("/api/v1/stores");
    expect(docs.body.paths).toHaveProperty("/api/v1/stores/{storeId}/products");
    expect(docs.body.paths).toHaveProperty("/api/v1/stores/{storeId}/orders/{orderId}");
    expect(docs.body.paths["/api/v1/stores/{storeId}/mobile-money"]).toHaveProperty("get");
    expect(docs.body.paths["/api/v1/stores/{storeId}/mobile-money"]).toHaveProperty("put");
    expect(docs.body.paths).toHaveProperty("/api/v1/public/stores/{slug}");
    expect(docs.body.paths).toHaveProperty("/api/v1/lives/{liveId}/products");
    expect(docs.body.components.schemas.StoreProductResponse.properties).toHaveProperty("storeId");
    expect(docs.body.components.schemas.StoreProductResponse.properties).not.toHaveProperty("liveId");
    expect(docs.body.components.schemas.LiveResponse.properties.status.enum).toEqual([
      "DRAFT", "ACTIVE", "ENDED",
    ]);
    expect(docs.body.components.schemas.StoreResponse.properties.status.enum).toEqual([
      "DRAFT", "PUBLISHED", "UNPUBLISHED",
    ]);
  });
});
