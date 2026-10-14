import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Order CSV export API", () => {
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
        name: "Fashion Live",
        slug: `fashion-${randomUUID()}`,
        status: "ACTIVE",
      },
    });

    liveId = live.id;

    const product = await prisma.product.create({
      data: {
        liveId,
        name: "Cotton Shirt",
        price: 12500,
      },
    });

    productId = product.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("exports order details and item totals as CSV", async () => {
    await prisma.order.create({
      data: {
        liveId,
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        totalAmount: 25000,
        items: {
          create: {
            productId,
            productName: "Cotton Shirt",
            unitPrice: 12500,
            quantity: 2,
          },
        },
      },
    });

    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/orders/export`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/csv");
    expect(response.headers["content-disposition"]).toContain(
      "Fashion-Live-orders.csv",
    );

    expect(response.text).toContain('"Customer Name"');
    expect(response.text).toContain('"Ama Mensah"');
    expect(response.text).toContain('"Cotton Shirt"');
    expect(response.text).toContain('"25000"');
  });

  it("exports headers when the Live has no orders", async () => {
    const response = await request(app)
      .get(`/api/v1/lives/${liveId}/orders/export`)
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.text).toContain('"Order ID"');
    expect(response.text).toContain('"Customer Phone"');
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get(
      `/api/v1/lives/${liveId}/orders/export`,
    );

    expect(response.status).toBe(401);
  });

  it("does not export another creator's orders", async () => {
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
        status: "ACTIVE",
      },
    });

    const response = await request(app)
      .get(`/api/v1/lives/${otherLive.id}/orders/export`)
      .set("Cookie", cookie);

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("LIVE_NOT_FOUND");
  });
});