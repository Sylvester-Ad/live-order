import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { publishStore, unpublishStore } from "../../src/modules/lives/lives.service.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("GET /api/v1/public/lives/:slug", () => {
  let creatorId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    const creator = await prisma.creator.create({
      data: {
        name: "Test Creator",
        accessCodeHash: await hashAccessCode("test-access-code"),
      },
    });

    creatorId = creator.id;
  });

  async function createLive(status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED") {
    return prisma.store.create({
      data: {
        creatorId,
        name: "Friday Live Sale",
        slug: `friday-live-${crypto.randomUUID().slice(0, 8)}`,
        status,
      },
    });
  }

  it("returns an active Live and its products without authentication", async () => {
    const live = await createLive("PUBLISHED");

    const product = await prisma.product.create({
      data: {
        storeId: live.id,
        name: "Black T-shirt",
        price: 5000,
        options: {
          sizes: ["S", "M", "L", "XL"],
          colors: ["Black", "White"],
        },
      },
    });

    await prisma.productImage.create({
      data: {
        productId: product.id,
        url: "https://res.cloudinary.com/test-cloud/image/upload/v123/test/shirt.png",
        storageId: "test/shirt",
        provider: "CLOUDINARY",
      },
    });

    const response = await request(app)
      .get(`/api/v1/public/lives/${live.slug}`)
      .expect(200);

    expect(response.body.data).toMatchObject({
      id: live.id,
      name: live.name,
      slug: live.slug,
      status: "ACTIVE",
    });

    expect(response.body.data.products).toHaveLength(1);
    expect(response.body.data.products[0]).toMatchObject({
      name: "Black T-shirt",
      price: 5000,
      stockQuantity: 0,
      available: false,
      image: {
        id: expect.any(String),
      },
    });
    expect(new URL(response.body.data.products[0].image.url).pathname).toBe(
      "/test-cloud/image/upload/c_limit,h_900,w_1200/f_auto/q_auto/v123/test/shirt",
    );

    expect(response.body.data.products).toHaveLength(1);

    expect(response.body.data.products[0]).toMatchObject({
      name: "Black T-shirt",
      price: 5000,
      options: {
        sizes: ["S", "M", "L", "XL"],
        colors: ["Black", "White"],
      },
    });
  });

  it("returns only the configured TikTok LIVE URL in public information", async () => {
    const live = await prisma.store.create({
      data: {
        creatorId,
        name: "Broadcast link",
        slug: `broadcast-${crypto.randomUUID().slice(0, 8)}`,
        status: "PUBLISHED",
        tiktokLiveUrl: "https://www.tiktok.com/@creator/live",
      },
    });

    const response = await request(app).get(`/api/v1/public/lives/${live.slug}`).expect(200);
    expect(response.body.data).toMatchObject({
      tiktokLiveUrl: "https://www.tiktok.com/@creator/live",
    });
    expect(response.body.data).not.toHaveProperty("creatorId");
    expect(response.body.data).not.toHaveProperty("creator");
  });

  it("returns null for Lives without a TikTok LIVE URL", async () => {
    const live = await createLive("PUBLISHED");
    const response = await request(app).get(`/api/v1/public/lives/${live.slug}`).expect(200);
    expect(response.body.data.tiktokLiveUrl).toBeNull();
  });

  it("returns an active Live with an empty products array", async () => {
    const live = await createLive("PUBLISHED");

    const response = await request(app)
      .get(`/api/v1/public/lives/${live.slug}`)
      .expect(200);

    expect(response.body.data.products).toEqual([]);
  });

  it("hides an unpublished Store, blocks checkout, then restores access when republished", async () => {
    const store = await createLive("PUBLISHED");
    const product = await prisma.product.create({
      data: {
        storeId: store.id,
        name: "In-stock item",
        price: 1500,
        stockQuantity: 5,
      },
    });

    const priorOrder = await request(app)
      .post(`/api/v1/lives/${store.id}/orders`)
      .send({
        customerName: "Earlier Customer",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(201);

    await unpublishStore(creatorId, store.id);

    await request(app).get(`/api/v1/public/lives/${store.slug}`).expect(404);
    const blockedOrder = await request(app)
      .post(`/api/v1/lives/${store.id}/orders`)
      .send({
        customerName: "Customer",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(409);
    expect(blockedOrder.body.error.code).toBe("LIVE_NOT_ACTIVE");
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity)
      .toBe(4);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(1);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: priorOrder.body.data.id } })).reference)
      .toBe(priorOrder.body.data.reference);

    await publishStore(creatorId, store.id);
    await request(app).get(`/api/v1/public/lives/${store.slug}`).expect(200);
    const acceptedOrder = await request(app)
      .post(`/api/v1/lives/${store.id}/orders`)
      .send({
        customerName: "Customer",
        customerPhone: "0241234567",
        deliveryLocation: "Accra",
        items: [{ productId: product.id, quantity: 1 }],
      })
      .expect(201);

    expect(acceptedOrder.body.data.liveId).toBe(store.id);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity)
      .toBe(3);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(2);
  });

  it.each(["DRAFT", "UNPUBLISHED"] as const)(
    "does not expose a %s Live",
    async (status) => {
      const live = await createLive(status);

      const response = await request(app)
        .get(`/api/v1/public/lives/${live.slug}`)
        .expect(404);

      expect(response.body.error.code).toBe("LIVE_NOT_FOUND");
    },
  );

  it("returns 404 for an unknown slug", async () => {
    const response = await request(app)
      .get("/api/v1/public/lives/does-not-exist")
      .expect(404);

    expect(response.body.error.code).toBe("LIVE_NOT_FOUND");
  });
});
