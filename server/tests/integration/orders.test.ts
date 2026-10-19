import request from "supertest";
import app from "../../src/app.js";
import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Orders API", () => {
  let cookie: string;
  let liveId: string;
  let tShirtId: string;
  let capId: string;

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

    const activationResponse = await request(app)
      .patch(`/api/v1/lives/${liveId}`)
      .set("Cookie", cookie)
      .send({ status: "ACTIVE" });

    expect(activationResponse.status).toBe(200);

    const tShirtResponse = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Classic T-shirt",
        price: 10000,
        stockQuantity: 20,
        options: {
          Size: ["S", "M", "L"],
          Colour: ["Black", "White"],
        },
      });

    expect(tShirtResponse.status).toBe(201);
    tShirtId = tShirtResponse.body.data.id;

    const capResponse = await request(app)
      .post(`/api/v1/lives/${liveId}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Baseball Cap",
        price: 5000,
        stockQuantity: 10,
      });

    expect(capResponse.status).toBe(201);
    capId = capResponse.body.data.id;

    expect(
      await prisma.live.findFirst({
        where: { id: liveId, creatorId: creator.id },
      }),
    ).not.toBeNull();
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("creates an order and calculates its total from database prices", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [
          {
            productId: tShirtId,
            quantity: 2,
            selectedOptions: {
              Size: "M",
              Colour: "Black",
            },
          },
          {
            productId: capId,
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(201);

    expect(response.body.data).toMatchObject({
      liveId,
      reference: expect.stringMatching(/^ORD-[A-F0-9]{16}$/),
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      totalAmount: 25000,
      paymentStatus: "PENDING",
    });

    expect(response.body.data.items).toHaveLength(2);

    const order = await prisma.order.findUnique({
      where: { id: response.body.data.id },
      include: { items: true },
    });

    expect(order).not.toBeNull();
    expect(order?.totalAmount).toBe(25000);
    expect((await prisma.product.findUnique({ where: { id: tShirtId } }))?.stockQuantity).toBe(18);
    expect((await prisma.product.findUnique({ where: { id: capId } }))?.stockQuantity).toBe(9);
    expect(order?.items).toHaveLength(2);

    expect(order?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productId: tShirtId,
          productName: "Classic T-shirt",
          unitPrice: 10000,
          quantity: 2,
        }),
        expect.objectContaining({
          productId: capId,
          productName: "Baseball Cap",
          unitPrice: 5000,
          quantity: 1,
        }),
      ]),
    );
  });

  it("rejects an order when the Live is still a draft", async () => {
    const draftResponse = await request(app)
      .post("/api/v1/lives")
      .set("Cookie", cookie)
      .send({ name: "Upcoming Live" });

    expect(draftResponse.status).toBe(201);

    const response = await request(app)
      .post(`/api/v1/lives/${draftResponse.body.data.id}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: tShirtId, quantity: 1 }],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("LIVE_NOT_ACTIVE");
  });

  it("rejects products that do not belong to the target Live", async () => {
    const otherLiveResponse = await request(app)
      .post("/api/v1/lives")
      .set("Cookie", cookie)
      .send({ name: "Another Live" });

    expect(otherLiveResponse.status).toBe(201);

    const otherProductResponse = await request(app)
      .post(`/api/v1/lives/${otherLiveResponse.body.data.id}/products`)
      .set("Cookie", cookie)
      .send({
        name: "Another Product",
        price: 7000,
      });

    expect(otherProductResponse.status).toBe(201);

    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [
          {
            productId: otherProductResponse.body.data.id,
            quantity: 1,
          },
        ],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PRODUCT");
  });

  it("rejects an order containing a nonexistent product", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: randomUUID(), quantity: 1 }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PRODUCT");
  });

  it("rejects an empty order", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [],
      });

    expect(response.status).toBe(400);
  });

  it("rejects insufficient stock without creating an order or decrementing any item", async () => {
    await prisma.product.update({ where: { id: tShirtId }, data: { stockQuantity: 1 } });
    const before = await prisma.order.count();

    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [
          { productId: capId, quantity: 2 },
          { productId: tShirtId, quantity: 2 },
        ],
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.order.count()).toBe(before);
    expect((await prisma.product.findUnique({ where: { id: capId } }))?.stockQuantity).toBe(10);
    expect((await prisma.product.findUnique({ where: { id: tShirtId } }))?.stockQuantity).toBe(1);
  });

  it("rejects option choices that are not configured for the product", async () => {
    const response = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: tShirtId, quantity: 1, selectedOptions: { Size: "XXL" } }],
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PRODUCT_OPTIONS");
    expect((await prisma.product.findUnique({ where: { id: tShirtId } }))?.stockQuantity).toBe(20);
  });

  it("allows only one concurrent request to buy the last unit", async () => {
    await prisma.product.update({ where: { id: capId }, data: { stockQuantity: 1 } });
    const makeOrder = () => request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: capId, quantity: 1 }],
      });

    const results = await Promise.all([makeOrder(), makeOrder()]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    expect(results.find((result) => result.status === 409)?.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: capId } }))?.stockQuantity).toBe(0);
  });

  it("returns the original order for an identical idempotent retry", async () => {
    const idempotencyKey = randomUUID();
    const first = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: tShirtId, quantity: 2, selectedOptions: { Size: "M", Colour: "Black" } }],
      });
    const retry = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        deliveryLocation: "Madina, Accra",
        customerPhone: "0241234567",
        customerName: "Ama Mensah",
        items: [{ productId: tShirtId, quantity: 2, selectedOptions: { Colour: "Black", Size: "M" } }],
      });

    expect(first.status).toBe(201);
    expect(retry.status).toBe(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    expect(retry.body.data.reference).toBe(first.body.data.reference);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: tShirtId } }))?.stockQuantity).toBe(18);
  });

  it("rejects reuse of an idempotency key for a different request", async () => {
    const idempotencyKey = randomUUID();
    const payload = {
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      items: [{ productId: capId, quantity: 1 }],
    };
    const first = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);
    const mismatched = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send({ ...payload, items: [{ productId: capId, quantity: 2 }] });

    expect(first.status).toBe(201);
    expect(mismatched.status).toBe(409);
    expect(mismatched.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: capId } }))?.stockQuantity).toBe(9);
  });

  it("serializes concurrent requests using the same idempotency key", async () => {
    await prisma.product.update({ where: { id: capId }, data: { stockQuantity: 1 } });
    const idempotencyKey = randomUUID();
    const makeOrder = () => request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: capId, quantity: 1 }],
      });

    const results = await Promise.all([makeOrder(), makeOrder()]);

    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(results[0]?.body.data.id).toBe(results[1]?.body.data.id);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: capId } }))?.stockQuantity).toBe(0);
  });

  it("allows retrying the same key after a failed attempt that committed no order", async () => {
    await prisma.product.update({ where: { id: tShirtId }, data: { stockQuantity: 0 } });
    const idempotencyKey = randomUUID();
    const payload = {
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      items: [{ productId: tShirtId, quantity: 1 }],
    };
    const failed = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);
    expect(await prisma.order.count()).toBe(0);

    await prisma.product.update({ where: { id: tShirtId }, data: { stockQuantity: 1 } });
    const retried = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", idempotencyKey)
      .send(payload);

    expect(failed.status).toBe(409);
    expect(failed.body.error.code).toBe("INSUFFICIENT_STOCK");
    expect(retried.status).toBe(201);
    expect(await prisma.order.count()).toBe(1);
    expect((await prisma.product.findUnique({ where: { id: tShirtId } }))?.stockQuantity).toBe(0);
  });

  it("creates distinct orders for genuinely new idempotency keys", async () => {
    const payload = {
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      items: [{ productId: capId, quantity: 1 }],
    };
    const first = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", randomUUID())
      .send(payload);
    const second = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", randomUUID())
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data.id).not.toBe(first.body.data.id);
    expect(second.body.data.reference).not.toBe(first.body.data.reference);
    expect(await prisma.order.count()).toBe(2);
    expect((await prisma.product.findUnique({ where: { id: capId } }))?.stockQuantity).toBe(8);
  });

  it("rejects malformed idempotency keys while remaining compatible without the header", async () => {
    const payload = {
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      items: [{ productId: capId, quantity: 1 }],
    };
    const invalid = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .set("Idempotency-Key", "not-a-uuid")
      .send(payload);
    const compatible = await request(app)
      .post(`/api/v1/lives/${liveId}/orders`)
      .send(payload);

    expect(invalid.status).toBe(400);
    expect(compatible.status).toBe(201);
    expect(await prisma.order.findUnique({ where: { id: compatible.body.data.id } })).toMatchObject({
      idempotencyKey: null,
      requestFingerprint: null,
    });
  });
});
