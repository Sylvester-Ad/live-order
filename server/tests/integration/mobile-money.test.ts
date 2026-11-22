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

function storeSettingsRequest(storeId: string, cookie: string) {
  return request(app)
    .put(`/api/v1/stores/${storeId}/mobile-money`)
    .set("Cookie", cookie);
}

describe("Creator Mobile Money settings and order snapshots", () => {
  let seller: Seller;
  let liveId: string;
  let productId: string;

  beforeEach(async () => {
    await resetTestDatabase();
    seller = await createSeller("Ama's shop");
    const live = await prisma.store.create({
      data: {
        creatorId: seller.creatorId,
        name: "Friday collection",
        slug: `friday-${randomUUID()}`,
        status: "PUBLISHED",
      },
    });
    liveId = live.id;
    const product = await prisma.product.create({
      data: { storeId: liveId, name: "Cotton shirt", price: 2500, stockQuantity: 20 },
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
        storeId: liveId,
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

  it("stores independent settings per Store and uses them through Store and Live checkout routes", async () => {
    const secondStore = await prisma.store.create({
      data: {
        creatorId: seller.creatorId,
        name: "Weekend collection",
        slug: `weekend-${randomUUID()}`,
        status: "PUBLISHED",
      },
    });
    const secondProduct = await prisma.product.create({
      data: { storeId: secondStore.id, name: "Linen shirt", price: 3500, stockQuantity: 5 },
    });

    const firstSettings = await storeSettingsRequest(liveId, seller.cookie).send({
      provider: "MTN_MOBILE_MONEY",
      mobileMoneyNumber: "0241234567",
      accountName: "First Store",
      enabled: true,
    });
    expect(firstSettings.status).toBe(200);

    const secondSettings = await storeSettingsRequest(secondStore.id, seller.cookie).send({
      provider: "TELECEL_CASH",
      mobileMoneyNumber: "0507654321",
      accountName: "Second Store",
      enabled: true,
    });
    expect(secondSettings.status).toBe(200);

    const firstOrder = await createOrder(liveId, productId);
    const secondOrder = await request(app)
      .post(`/api/v1/stores/${secondStore.id}/orders`)
      .set("Idempotency-Key", randomUUID())
      .send({
        customerName: "Ama Mensah",
        customerPhone: "0241234567",
        deliveryLocation: "Madina, Accra",
        items: [{ productId: secondProduct.id, quantity: 1 }],
      });

    expect(firstOrder.body.data).toMatchObject({
      mobileMoneyProvider: "MTN_MOBILE_MONEY",
      mobileMoneyNumber: "0241234567",
      mobileMoneyAccountName: "First Store",
    });
    expect(secondOrder.body.data).toMatchObject({
      mobileMoneyProvider: "TELECEL_CASH",
      mobileMoneyNumber: "0507654321",
      mobileMoneyAccountName: "Second Store",
    });

    const sameNumber = await storeSettingsRequest(secondStore.id, seller.cookie).send({
      provider: "TELECEL_CASH",
      mobileMoneyNumber: "0241234567",
      accountName: "Second Store",
      enabled: true,
    });
    expect(sameNumber.status).toBe(200);

    const disabled = await storeSettingsRequest(secondStore.id, seller.cookie).send({
      provider: "TELECEL_CASH",
      mobileMoneyNumber: "0241234567",
      accountName: "Second Store",
      enabled: false,
    });
    expect(disabled.status).toBe(200);
    const disabledOrder = await createOrder(secondStore.id, secondProduct.id);
    expect(disabledOrder.body.data).toMatchObject({
      mobileMoneyProvider: null,
      mobileMoneyNumber: null,
      mobileMoneyAccountName: null,
    });

    const orderHistory = await request(app)
      .get(`/api/v1/stores/${secondStore.id}/orders`)
      .set("Cookie", seller.cookie)
      .expect(200);
    expect(orderHistory.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reference: secondOrder.body.data.reference,
        mobileMoneyProvider: "TELECEL_CASH",
        mobileMoneyNumber: "0507654321",
        mobileMoneyAccountName: "Second Store",
      }),
    ]));
  });

  it("requires Store ownership and returns null for an unconfigured owned Store", async () => {
    const unauthenticated = await request(app).get(`/api/v1/stores/${liveId}/mobile-money`);
    expect(unauthenticated.status).toBe(401);

    const empty = await request(app)
      .get(`/api/v1/stores/${liveId}/mobile-money`)
      .set("Cookie", seller.cookie);
    expect(empty.status).toBe(200);
    expect(empty.body.data).toBeNull();

    const otherSeller = await createSeller("Other seller");
    await request(app)
      .get(`/api/v1/stores/${liveId}/mobile-money`)
      .set("Cookie", otherSeller.cookie)
      .expect(404);
    await request(app)
      .put(`/api/v1/stores/${liveId}/mobile-money`)
      .set("Cookie", otherSeller.cookie)
      .send({
        provider: "AT_MONEY",
        mobileMoneyNumber: "0279876543",
        accountName: "Other seller",
        enabled: true,
      })
      .expect(404);
  });

  it("refreshes inherited settings but preserves Store-managed settings on legacy updates", async () => {
    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "MTN_MOBILE_MONEY",
        mobileMoneyNumber: "0241234567",
        accountName: "Legacy default",
        enabled: true,
      })
      .expect(200);

    const inheritedStore = await prisma.store.create({
      data: {
        creatorId: seller.creatorId,
        name: "Inherited store",
        slug: `inherited-${randomUUID()}`,
      },
    });
    const managedStore = await prisma.store.create({
      data: {
        creatorId: seller.creatorId,
        name: "Managed store",
        slug: `managed-${randomUUID()}`,
      },
    });

    await prisma.storeMobileMoneySettings.create({
      data: {
        storeId: inheritedStore.id,
        provider: "MTN_MOBILE_MONEY",
        mobileMoneyNumber: "0241234567",
        accountName: "Legacy default",
        enabled: true,
        origin: "LEGACY_INHERITED",
      },
    });
    await storeSettingsRequest(managedStore.id, seller.cookie).send({
      provider: "AT_MONEY",
      mobileMoneyNumber: "0279876543",
      accountName: "Managed settings",
      enabled: false,
    }).expect(200);

    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "TELECEL_CASH",
        mobileMoneyNumber: "0507654321",
        accountName: "Updated legacy default",
        enabled: true,
      })
      .expect(200);

    const inherited = await prisma.storeMobileMoneySettings.findUniqueOrThrow({ where: { storeId: inheritedStore.id } });
    const managed = await prisma.storeMobileMoneySettings.findUniqueOrThrow({ where: { storeId: managedStore.id } });
    expect(inherited).toMatchObject({
      provider: "TELECEL_CASH",
      mobileMoneyNumber: "0507654321",
      accountName: "Updated legacy default",
      enabled: true,
      origin: "LEGACY_INHERITED",
    });
    expect(managed).toMatchObject({
      provider: "AT_MONEY",
      mobileMoneyNumber: "0279876543",
      accountName: "Managed settings",
      enabled: false,
      origin: "STORE_MANAGED",
    });
  });

  it("new Stores inherit existing legacy settings and remain unconfigured when none exist", async () => {
    await request(app)
      .put("/api/v1/creator/mobile-money")
      .set("Cookie", seller.cookie)
      .send({
        provider: "AT_MONEY",
        mobileMoneyNumber: "0279876543",
        accountName: "Ama Mensah",
        enabled: false,
      })
      .expect(200);

    const created = await request(app)
      .post("/api/v1/stores")
      .set("Cookie", seller.cookie)
      .send({ name: "New inherited Store" });
    expect(created.status).toBe(201);
    const inherited = await prisma.storeMobileMoneySettings.findUnique({
      where: { storeId: created.body.data.id },
    });
    expect(inherited).toMatchObject({
      provider: "AT_MONEY",
      mobileMoneyNumber: "0279876543",
      accountName: "Ama Mensah",
      enabled: false,
      origin: "LEGACY_INHERITED",
    });

    const otherSeller = await createSeller("No settings seller");
    const unconfigured = await request(app)
      .post("/api/v1/stores")
      .set("Cookie", otherSeller.cookie)
      .send({ name: "Unconfigured Store" });
    expect(unconfigured.status).toBe(201);
    expect(await prisma.storeMobileMoneySettings.findUnique({
      where: { storeId: unconfigured.body.data.id },
    })).toBeNull();
  });
});
