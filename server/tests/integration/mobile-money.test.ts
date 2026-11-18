import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

type Seller = { creatorId: string; cookie: string };

async function createSeller(name: string): Promise<Seller> {
  const accessCode = `LO-${randomUUID()}`;
  const creator = await prisma.creator.create({
    data: { name, accessCodeHash: await hashAccessCode(accessCode) },
  });
  const login = await request(app).post("/api/v1/creator/access").send({ accessCode });
  expect(login.status).toBe(200);
  return { creatorId: creator.id, cookie: login.headers["set-cookie"][0].split(";")[0] };
}

async function createOrder(liveId: string, productId: string, idempotencyKey = randomUUID()) {
  return request(app)
    .post(`/api/v1/lives/${liveId}/orders`)
    .set("Idempotency-Key", idempotencyKey)
    .send({
      customerName: "Ama Mensah",
      customerPhone: "0241234567",
      deliveryLocation: "Madina, Accra",
      items: [{ productId, quantity: 1 }],
    });
}

describe("Creator Mobile Money settings and order snapshots", () => {
  let seller: Seller;
  let liveId: string;
  let productId: string;

  beforeEach(async () => {
    await resetTestDatabase();
    seller = await createSeller("Ama's shop");
    const live = await prisma.live.create({
      data: {
        creatorId: seller.creatorId,
        name: "Friday collection",
        slug: `friday-${randomUUID()}`,
        status: "ACTIVE",
      },
    });
    liveId = live.id;
    const product = await prisma.product.create({
      data: { liveId, name: "Cotton shirt", price: 2500, stockQuantity: 20 },
    });
    productId = product.id;
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("requires authentication and creates or updates only the current creator's settings", async () => {
    const unauthenticatedGet = await request(app).get("/api/v1/creator/mobile-money");
    const unauthenticatedSave = await request(app).put("/api/v1/creator/mobile-money").send({
      provider: "MTN_MOBILE_MONEY",
      mobileMoneyNumber: "0241234567",
      accountName: "Ama Mensah",
      enabled: true,
    });
    expect(unauthenticatedGet.status).toBe(401);
    expect(unauthenticatedSave.status).toBe(401);

    const empty = await request(app).get("/api/v1/creator/mobile-money").set("Cookie", seller.cookie);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toBeNull();

    const created = await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "MTN_MOBILE_MONEY",
        mobileMoneyNumber: "+233 24 123 4567",
        accountName: "Ama Mensah",
        enabled: true,
      });
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({
      provider: "MTN_MOBILE_MONEY",
      mobileMoneyNumber: "0241234567",
      accountName: "Ama Mensah",
      enabled: true,
    });

    const updated = await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "TELECEL_CASH",
        mobileMoneyNumber: "050 765 4321",
        accountName: "Ama's Boutique",
        enabled: true,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      provider: "TELECEL_CASH",
      mobileMoneyNumber: "0507654321",
      accountName: "Ama's Boutique",
      enabled: true,
    });
  });

  it("does not allow one creator to view or modify another creator's settings", async () => {
    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "MTN_MOBILE_MONEY",
        mobileMoneyNumber: "0241234567",
        accountName: "Ama Mensah",
        enabled: true,
      })
      .expect(200);

    const otherSeller = await createSeller("Another seller");
    const otherSettings = await request(app)
      .get("/api/v1/creator/mobile-money")
      .set("Cookie", otherSeller.cookie);
    expect(otherSettings.status).toBe(200);
    expect(otherSettings.body.data).toBeNull();

    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", otherSeller.cookie)
      .send({
        provider: "AT_MONEY",
        mobileMoneyNumber: "0279876543",
        accountName: "Other Seller",
        enabled: true,
      })
      .expect(200);

    const originalSettings = await request(app)
      .get("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie);
    expect(originalSettings.body.data).toMatchObject({
      provider: "MTN_MOBILE_MONEY",
      mobileMoneyNumber: "0241234567",
      accountName: "Ama Mensah",
    });
  });

  it("validates Ghanaian number shape and preserves saved details when disabled", async () => {
    const invalid = await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "AT_MONEY",
        mobileMoneyNumber: "12345",
        accountName: "Ama Mensah",
        enabled: true,
      });
    expect(invalid.status).toBe(400);

    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "AT_MONEY",
        mobileMoneyNumber: "0279876543",
        accountName: "Ama Mensah",
        enabled: true,
      })
      .expect(200);

    const disabled = await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "AT_MONEY",
        mobileMoneyNumber: "0279876543",
        accountName: "Ama Mensah",
        enabled: false,
      });
    expect(disabled.body.data).toMatchObject({
      provider: "AT_MONEY",
      mobileMoneyNumber: "0279876543",
      accountName: "Ama Mensah",
      enabled: false,
    });

    const order = await createOrder(liveId, productId);
    expect(order.status).toBe(201);
    expect(order.body.data.mobileMoneyProvider).toBeNull();
    expect(order.body.data.mobileMoneyNumber).toBeNull();
    expect(order.body.data.mobileMoneyAccountName).toBeNull();
  });

  it("snapshots enabled settings onto new orders and leaves earlier snapshots unchanged", async () => {
    const withoutSettings = await createOrder(liveId, productId);
    expect(withoutSettings.status).toBe(201);
    expect(withoutSettings.body.data).toMatchObject({
      mobileMoneyProvider: null,
      mobileMoneyNumber: null,
      mobileMoneyAccountName: null,
    });

    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "MTN_MOBILE_MONEY",
        mobileMoneyNumber: "0241234567",
        accountName: "Ama Mensah",
        enabled: true,
      })
      .expect(200);

    const firstPaidInstructions = await createOrder(liveId, productId);
    expect(firstPaidInstructions.body.data).toMatchObject({
      mobileMoneyProvider: "MTN_MOBILE_MONEY",
      mobileMoneyNumber: "0241234567",
      mobileMoneyAccountName: "Ama Mensah",
    });

    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "TELECEL_CASH",
        mobileMoneyNumber: "0507654321",
        accountName: "Ama's Boutique",
        enabled: true,
      })
      .expect(200);

    const laterOrder = await createOrder(liveId, productId);
    expect(laterOrder.body.data).toMatchObject({
      mobileMoneyProvider: "TELECEL_CASH",
      mobileMoneyNumber: "0507654321",
      mobileMoneyAccountName: "Ama's Boutique",
    });

    const sellerOrders = await request(app)
      .get(`/api/v1/lives/${liveId}/orders`)
      .set("Cookie", seller.cookie);
    expect(sellerOrders.status).toBe(200);
    expect(sellerOrders.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reference: firstPaidInstructions.body.data.reference,
        mobileMoneyProvider: "MTN_MOBILE_MONEY",
        mobileMoneyNumber: "0241234567",
        mobileMoneyAccountName: "Ama Mensah",
      }),
      expect.objectContaining({
        reference: laterOrder.body.data.reference,
        mobileMoneyProvider: "TELECEL_CASH",
        mobileMoneyNumber: "0507654321",
        mobileMoneyAccountName: "Ama's Boutique",
      }),
      expect.objectContaining({
        reference: withoutSettings.body.data.reference,
        mobileMoneyProvider: null,
        mobileMoneyNumber: null,
        mobileMoneyAccountName: null,
      }),
    ]));
  });

  it("returns null snapshots for legacy orders created without payment details", async () => {
    const order = await prisma.order.create({
      data: {
        liveId,
        reference: `ORD-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`,
        customerName: "Legacy Customer",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        totalAmount: 2500,
        items: {
          create: {
            productId,
            productName: "Cotton shirt",
            unitPrice: 2500,
            quantity: 1,
          },
        },
      },
    });
    const orders = await request(app).get(`/api/v1/lives/${liveId}/orders`).set("Cookie", seller.cookie);
    expect(orders.status).toBe(200);
    expect(orders.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: order.id,
        mobileMoneyProvider: null,
        mobileMoneyNumber: null,
        mobileMoneyAccountName: null,
      }),
    ]));
  });
});
