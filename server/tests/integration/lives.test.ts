import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Live lifecycle", () => {
  let accessCode: string;
  let cookie: string;
  let liveId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    accessCode = `LO-${randomUUID()}`;

    const creator = await prisma.creator.create({
      data: {
        name: "Integration Test Creator",
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

    const liveResponse = await request(app)
      .post("/api/v1/lives")
      .set("Cookie", cookie)
      .send({ name: "Test Fashion Live" });

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

  it("creates a Live in DRAFT status and activates it", async () => {
    const initialLive = await prisma.live.findUniqueOrThrow({
      where: { id: liveId },
    });

    expect(initialLive.status).toBe("DRAFT");

    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}`)
      .set("Cookie", cookie)
      .send({ status: "ACTIVE" });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ACTIVE");
  });

  it("accepts, updates, and clears a supported TikTok LIVE URL", async () => {
    const url = "https://www.tiktok.com/@creator/live";
    const createResponse = await request(app)
      .post("/api/v1/lives")
      .set("Cookie", cookie)
      .send({ name: "URL test Live", tiktokLiveUrl: url })
      .expect(201);

    expect(createResponse.body.data.tiktokLiveUrl).toBe(url);

    const updated = await request(app)
      .patch(`/api/v1/lives/${createResponse.body.data.id}`)
      .set("Cookie", cookie)
      .send({ tiktokLiveUrl: "https://tiktok.com/@creator/live-now" })
      .expect(200);
    expect(updated.body.data.tiktokLiveUrl).toBe("https://tiktok.com/@creator/live-now");

    const cleared = await request(app)
      .patch(`/api/v1/lives/${createResponse.body.data.id}`)
      .set("Cookie", cookie)
      .send({ tiktokLiveUrl: null })
      .expect(200);
    expect(cleared.body.data.tiktokLiveUrl).toBeNull();
  });

  it.each([
    "http://www.tiktok.com/@creator/live",
    "https://tiktok.example/@creator/live",
    "https://not-tiktok.com/@creator/live",
    "https://tiktok.com.example.org/@creator/live",
    "https://tiktok.com:444/@creator/live",
    "https://user:pass@tiktok.com/@creator/live",
  ])("rejects unsupported TikTok LIVE URL %s", async (tiktokLiveUrl) => {
    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}`)
      .set("Cookie", cookie)
      .send({ tiktokLiveUrl });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects attempts to reopen an ended Live", async () => {
    await prisma.live.update({
      where: { id: liveId },
      data: { status: "ENDED" },
    });

    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}`)
      .set("Cookie", cookie)
      .send({ status: "ACTIVE" });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVALID_STATUS_TRANSITION");
  });

  it("rejects requests from unauthenticated users", async () => {
    const response = await request(app)
      .patch(`/api/v1/lives/${liveId}`)
      .send({ status: "ACTIVE" });

    expect(response.status).toBe(401);
  });
});
