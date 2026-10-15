import request from "supertest";
import app from "../../src/app.js";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Products API", () => {
  let cookie: string;
  let liveId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    const accessCode = `LO-${randomUUID()}`;

    const creator = await prisma.creator.create({
      data: {
        name: "Test Creator",
        accessCodeHash: await hashAccessCode(accessCode),
      },
    });

    const loginResponse = await request(app)
      .post("/api/v1/creator/access")
      .send({ accessCode });

    expect(loginResponse.status).toBe(200);

    const setCookie = loginResponse.headers["set-cookie"];
    expect(setCookie).toBeDefined();

    cookie = setCookie[0].split(";")[0];

    const liveResponse = await request(app)
      .post("/api/v1/lives")
      .set("Cookie", cookie)
      .send({ name: "Friday Fashion Live" });

    expect(liveResponse.status).toBe(201);

    liveId = liveResponse.body.data.id;

    expect(
      await prisma.live.findFirst({
        where: { id: liveId, creatorId: creator.id },
      }),
    ).not.toBeNull();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates a product belonging to the creator's Live", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Classic T-shirt",
        price: 10000,
        options: {
          sizes: ["S", "M", "L"],
          colors: ["Black", "White"],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      liveId,
      name: "Classic T-shirt",
      price: 10000,
      options: {
        sizes: ["S", "M", "L"],
        colors: ["Black", "White"],
      },
    });

    const product = await prisma.product.findUnique({
      where: { id: response.body.data.id },
    });

    expect(product?.liveId).toBe(liveId);
  });

  it("rejects product creation without authentication", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .send({
        name: "Classic T-shirt",
        price: 10000,
      });

    expect(response.status).toBe(401);
  });

  it("rejects a product with an invalid price", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Classic T-shirt",
        price: -100,
      });

    expect(response.status).toBe(400);
  });

  it("rejects product creation for a nonexistent Live", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${randomUUID()}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Classic T-shirt",
        price: 10000,
      });

    expect(response.status).toBe(404);
  });

  it("lists products belonging to the creator's Live", async () => {
    await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Classic T-shirt", price: 10000 });
    await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Baseball Cap", price: 5000 });

    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(
      response.body.data.map((product: { name: string }) => product.name),
    ).toEqual(["Classic T-shirt", "Baseball Cap"]);
  });

  it("returns an empty array when a Live has no products", async () => {
    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects product listing without authentication", async () => {
    const response = await request(app).get(`/api/v1/lives/${liveId}/products`);

    expect(response.status).toBe(401);
  });

  it("does not list products for another creator's Live", async () => {
    const otherCreator = await prisma.creator.create({
      data: {
        name: "Other Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });
    const otherLive = await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Private Live",
        slug: `private-${randomUUID()}`,
      },
    });

    const response = await request(app)
      .get(`/api/v1/lives/${otherLive.id}/products`)
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("LIVE_NOT_FOUND");
  });

  it("updates product fields and allows clearing options", async () => {
    const created = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Classic T-shirt",
        price: 10000,
        options: { sizes: ["S", "M", "L"] },
      });

    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${created.body.data.id}`)
      .set("Cookie", cookie)
      .send({ name: "Cotton T-shirt", price: 12500, options: null });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: created.body.data.id,
      liveId,
      name: "Cotton T-shirt",
      price: 12500,
      options: null,
    });
  });

  it("rejects an empty product update", async () => {
    const created = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Classic T-shirt", price: 10000 });

    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${created.body.data.id}`)
      .set("Cookie", cookie)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("does not update a product from another creator's Live", async () => {
    const otherCreator = await prisma.creator.create({
      data: {
        name: "Other Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });
    const otherLive = await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Private Live",
        slug: `private-${randomUUID()}`,
      },
    });
    const product = await prisma.product.create({
      data: { liveId: otherLive.id, name: "Private product", price: 5000 },
    });

    const response = await request(app)
      .patch(`/api/v1/lives/${otherLive.id}/products/${product.id}`)
      .set("Cookie", cookie)
      .send({ name: "Changed name" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
  });

  it("deletes a product without order history", async () => {
    const created = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Classic T-shirt", price: 10000 });

    const response = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${created.body.data.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(204);
    expect(
      await prisma.product.findUnique({ where: { id: created.body.data.id } }),
    ).toBeNull();
  });

  it("prevents deleting a product referenced by order history", async () => {
    const created = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Classic T-shirt", price: 10000 });
    await prisma.order.create({
      data: {
        liveId,
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        totalAmount: 10000,
        items: {
          create: {
            productId: created.body.data.id,
            productName: "Classic T-shirt",
            unitPrice: 10000,
            quantity: 1,
          },
        },
      },
    });

    const response = await request(app)
      .delete(`/api/v1/lives/${liveId}/products/${created.body.data.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PRODUCT_IN_USE");
    expect(
      await prisma.product.findUnique({ where: { id: created.body.data.id } }),
    ).not.toBeNull();
  });

  it("does not delete a product from another creator's Live", async () => {
    const otherCreator = await prisma.creator.create({
      data: {
        name: "Other Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });
    const otherLive = await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Private Live",
        slug: `private-${randomUUID()}`,
      },
    });
    const product = await prisma.product.create({
      data: { liveId: otherLive.id, name: "Private product", price: 5000 },
    });

    const response = await request(app)
      .delete(`/api/v1/lives/${otherLive.id}/products/${product.id}`)
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("PRODUCT_NOT_FOUND");
    expect(
      await prisma.product.findUnique({ where: { id: product.id } }),
    ).not.toBeNull();
  });

  it("requires authentication to update and delete products", async () => {
    const created = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Classic T-shirt", price: 10000 });

    const update = await request(app)
      .patch(`/api/v1/lives/${liveId}/products/${created.body.data.id}`)
      .send({ name: "Changed name" });
    const deletion = await request(app).delete(
      `/api/v1/lives/${liveId}/products/${created.body.data.id}`,
    );

    expect(update.status).toBe(401);
    expect(deletion.status).toBe(401);
  });
});
