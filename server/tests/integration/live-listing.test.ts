import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Creator Live listing API", () => {
  let cookie: string;
  let creatorId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    const accessCode = `LO-${randomUUID()}`;

    const creator = await prisma.creator.create({
      data: {
        name: "Test Creator",
        accessCodeHash: await hashAccessCode(accessCode),
      },
    });

    creatorId = creator.id;

    const login = await request(app)
      .post("/api/v1/creator/access")
      .send({ accessCode });

    expect(login.status).toBe(200);

    const setCookie = login.headers["set-cookie"];
    expect(setCookie).toBeDefined();
    cookie = setCookie[0].split(";")[0];
  });

  afterEach(async () => {
    await resetTestDatabase();
  });

  it("returns only the authenticated creator's Lives", async () => {
    await prisma.live.createMany({
      data: [
        {
          creatorId,
          name: "First Live",
          slug: `first-${randomUUID()}`,
        },
        {
          creatorId,
          name: "Second Live",
          slug: `second-${randomUUID()}`,
        },
      ],
    });

    const otherCreator = await prisma.creator.create({
      data: {
        name: "Other Creator",
        accessCodeHash: await hashAccessCode(`LO-${randomUUID()}`),
      },
    });

    await prisma.live.create({
      data: {
        creatorId: otherCreator.id,
        name: "Private Live",
        slug: `private-${randomUUID()}`,
      },
    });

    const response = await request(app)
      .get("/api/v1/lives")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(2);

    expect(
      response.body.data.map((live: { name: string }) => live.name),
    ).toEqual(expect.arrayContaining(["First Live", "Second Live"]));

    expect(
      response.body.data.some(
        (live: { name: string }) => live.name === "Private Live",
      ),
    ).toBe(false);
  });

  it("returns an empty array when the creator has no Lives", async () => {
    const response = await request(app)
      .get("/api/v1/lives")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app).get("/api/v1/lives");

    expect(response.status).toBe(401);
  });
});