import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { resetTestDatabase } from "../helpers/test-database.js";

describe("Creator authentication", () => {
  let accessCode: string;
  let cookie: string;
  let creatorId: string;

  beforeEach(async () => {
    await resetTestDatabase();

    accessCode = `LO-${randomUUID()}`;

    const creator = await prisma.creator.create({
      data: {
        name: "Authentication Test Creator",
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

  it("returns the authenticated creator", async () => {
    const response = await request(app)
      .get("/api/v1/creator/me")
      .set("Cookie", cookie);

    expect(response.status).toBe(200);
    expect(response.body.data.id).toBe(creatorId);
    expect(response.body.data.name).toBe("Authentication Test Creator");
  });

  it("logs out and invalidates the current session", async () => {
    const sessionCountBefore = await prisma.creatorSession.count({
      where: { creatorId },
    });

    expect(sessionCountBefore).toBe(1);

    const logout = await request(app)
      .post("/api/v1/creator/logout")
      .set("Cookie", cookie);

    expect(logout.status).toBe(204);

    const clearedCookies = logout.headers["set-cookie"];

    expect(clearedCookies).toBeDefined();
    expect(clearedCookies[0]).toMatch(/^session=;/i);

    const sessionCountAfter = await prisma.creatorSession.count({
      where: { creatorId },
    });

    expect(sessionCountAfter).toBe(0);

    const me = await request(app)
      .get("/api/v1/creator/me")
      .set("Cookie", cookie);

    expect(me.status).toBe(401);
  });

  it("allows logout without a session cookie", async () => {
    const response = await request(app)
      .post("/api/v1/creator/logout");

    expect(response.status).toBe(204);
    expect(response.headers["set-cookie"]).toBeDefined();

    const sessionCount = await prisma.creatorSession.count({
      where: { creatorId },
    });

    expect(sessionCount).toBe(1);
  });

  it("does not invalidate another session belonging to the same creator", async () => {
    const secondLogin = await request(app)
      .post("/api/v1/creator/access")
      .send({ accessCode });

    expect(secondLogin.status).toBe(200);

    const secondCookie = secondLogin.headers["set-cookie"][0].split(";")[0];

    const sessionCountBefore = await prisma.creatorSession.count({
      where: { creatorId },
    });

    expect(sessionCountBefore).toBe(2);

    const logout = await request(app)
      .post("/api/v1/creator/logout")
      .set("Cookie", cookie);

    expect(logout.status).toBe(204);

    const sessionCountAfter = await prisma.creatorSession.count({
      where: { creatorId },
    });

    expect(sessionCountAfter).toBe(1);

    const firstSession = await request(app)
      .get("/api/v1/creator/me")
      .set("Cookie", cookie);

    expect(firstSession.status).toBe(401);

    const secondSession = await request(app)
      .get("/api/v1/creator/me")
      .set("Cookie", secondCookie);

    expect(secondSession.status).toBe(200);
    expect(secondSession.body.data.id).toBe(creatorId);
  });

  it("allows repeated logout requests", async () => {
    const firstLogout = await request(app)
      .post("/api/v1/creator/logout")
      .set("Cookie", cookie);

    expect(firstLogout.status).toBe(204);

    const secondLogout = await request(app)
      .post("/api/v1/creator/logout")
      .set("Cookie", cookie);

    expect(secondLogout.status).toBe(204);
  });
});