import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Order listing API", () => {
  let cookie: string;
  let liveId: string;
  let productId: string;

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

    liveId = live.id;

    const product = await prisma.product.create({
      data: {
        liveId,
        name: "Test Shirt",
        price: 10000,
      },
    });

    productId = product.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("returns orders with their items, newest first", async () => {
    const olderOrder = await prisma.order.create({
      data: {
        liveId,
        customerName: "Older Customer",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        totalAmount: 10000,
        items: {
          create: {
            productId,
            productName: "Test Shirt",
            unitPrice: 10000,
            quantity: 1,
          },
        },
        createdAt: new Date("2026-01-01T10:00:00.000Z"),
      },
    });

    const newerOrder = await prisma.order.create({
      data: {
        liveId,
        customerName: "Newer Customer",
        customerPhone: "0247654321",
        deliveryLocation: "Kumasi",
        totalAmount: 20000,
        items: {
          create: {
            productId,
            productName: "Test Shirt",
            unitPrice: 10000,
            quantity: 2,
          },
        },
        createdAt: new Date("2026-01-02T10:00:00.000Z"),
      },
    });

    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/orders`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);
    expect(response.body.data[0].id).toBe(newerOrder.id);
    expect(response.body.data[1].id).toBe(olderOrder.id);

    expect(response.body.data[0]).toMatchObject({
      customerName: "Newer Customer",
      totalAmount: 20000,
      paymentStatus: "PENDING",
      items: [
        {
          productId,
          productName: "Test Shirt",
          unitPrice: 10000,
          quantity: 2,
        },
      ],
    });
  });

  it("returns an empty array when a Live has no orders", async () => {
    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/orders`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get(
      `/api/v1/lives/${liveId}/orders`,
    );

    expect(response.status).toBe(401);
  });

  it("does not expose another creator's orders", async () => {
    const otherCreator = await prisma.creator.create({
      data: {
        name: "Another Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });

    const otherLive = await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Private Live",
        slug: `private-live-${randomUUID()}`,
        status: "ACTIVE",
      },
    });

    const response = await request(app)
      .get(`/api/v1/lives/${otherLive.id}/orders`)
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("LIVE_NOT_FOUND");
  });
});