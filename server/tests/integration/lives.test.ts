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