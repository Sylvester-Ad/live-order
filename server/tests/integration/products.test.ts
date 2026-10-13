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
});
