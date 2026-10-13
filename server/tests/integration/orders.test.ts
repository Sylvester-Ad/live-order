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
        options: {
          sizes: ["S", "M", "L"],
          colors: ["Black", "White"],
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
              size: "M",
              color: "Black",
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
});
