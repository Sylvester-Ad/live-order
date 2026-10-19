import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
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

  async function createLive(status: "DRAFT" | "ACTIVE" | "ENDED") {
    return prisma.live.create({
      data: {
        creatorId,
        name: "Friday Live Sale",
        slug: `friday-live-${crypto.randomUUID().slice(0, 8)}`,
        status,
      },
    });
  }

  it("returns an active Live and its products without authentication", async () => {
    const live = await createLive("ACTIVE");

    const product = await prisma.product.create({
      data: {
        liveId: live.id,
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
        url: "https://images.example/shirt.png",
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
        url: "https://images.example/shirt.png",
      },
    });

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

  it("returns an active Live with an empty products array", async () => {
    const live = await createLive("ACTIVE");

    const response = await request(app)
      .get(`/api/v1/public/lives/${live.slug}`)
      .expect(200);

    expect(response.body.data.products).toEqual([]);
  });

  it.each(["DRAFT", "ENDED"] as const)(
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
