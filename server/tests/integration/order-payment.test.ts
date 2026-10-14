import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Order payment API", () => {
  let cookie: string;
  let orderId: string;
  let otherOrderId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    const accessCode = `LO-${randomUUID()}`;

    const creator = await prisma.creator.create({
      data: {
        name: "Test Creator",
        accessCodeHash: await hashAccessCode(accessCode),
      },
    });

    const login = await request(app)
      .post("/api/v1/creator/access")
      .send({ accessCode });

    expect(login.status).toBe(200);

    const setCookie = login.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    cookie = setCookie[0].split(";")[0];

    const live = await prisma.live.create({
      data: {
        creatorId: creator.id,
        name: "Test Live",
        slug: `test-live-${randomUUID()}`,
        status: "ACTIVE",
      },
    });

    const product = await prisma.product.create({
      data: {
        liveId: live.id,
        name: "Test Shirt",
        price: 10000,
      },
    });

    const order = await prisma.order.create({
      data: {
        liveId: live.id,
        customerName: "Test Customer",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        totalAmount: 10000,
        items: {
          create: {
            productId: product.id,
            productName: product.name,
            unitPrice: product.price,
            quantity: 1,
          },
        },
      },
    });

    orderId = order.id;

    const otherCreator = await prisma.creator.create({
      data: {
        name: "Another Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });

    const otherLive = await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Another Live",
        slug: `another-live-${randomUUID()}`,
        status: "ACTIVE",
      },
    });

    const otherProduct = await prisma.product.create({
      data: {
        liveId: otherLive.id,
        name: "Other Product",
        price: 5000,
      },
    });

    const otherOrder = await prisma.order.create({
      data: {
        liveId: otherLive.id,
        customerName: "Another Customer",
        customerPhone: "0247654321",
        deliveryLocation: "Kumasi",
        totalAmount: 5000,
        items: {
          create: {
            productId: otherProduct.id,
            productName: otherProduct.name,
            unitPrice: otherProduct.price,
            quantity: 1,
          },
        },
      },
    });

    otherOrderId = otherOrder.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("marks an order as paid", async () => {
    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PAID" });

    expect(response.status).toBe(200);
    expect(response.body.data.paymentStatus).toBe("PAID");

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });

    expect(order.paymentStatus).toBe("PAID");
  });

  it("allows an order to be marked as paid more than once", async () => {
    const firstResponse = await request(app)
      .patch(`/api/v1/orders/${orderId}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PAID" });

    const secondResponse = await request(app)
      .patch(`/api/v1/orders/${orderId}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PAID" });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body.data.paymentStatus).toBe("PAID");
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}`)
      .send({ paymentStatus: "PAID" });

    expect(response.status).toBe(401);
  });

  it("does not allow a creator to update another creator's order", async () => {
    const response = await request(app)
      .patch(`/api/v1/orders/${otherOrderId}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PAID" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("ORDER_NOT_FOUND");

    const otherOrder = await prisma.order.findUniqueOrThrow({
      where: { id: otherOrderId },
    });

    expect(otherOrder.paymentStatus).toBe("PENDING");
  });

  it("rejects unsupported payment status updates", async () => {
    const response = await request(app)
      .patch(`/api/v1/orders/${orderId}`)
      .set("Cookie", cookie)
      .send({ paymentStatus: "PENDING" });

    expect(response.status).toBe(400);
  });
});