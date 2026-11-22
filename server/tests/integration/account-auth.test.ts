import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import app from "../../src/app.js";
import { prisma } from "../../src/database/prisma.js";
import { hashAccessCode } from "../../src/shared/utils/credentials.js";
import { clearTestAuthEmails, getTestAuthEmails } from "../../src/modules/creators/email-delivery.js";
import { resetAuthRateLimitsForTests } from "../../src/modules/creators/auth-rate-limit.js";
import { resetTestDatabase } from "../helpers/test-database.js";

const password = "SellerPassword123";
const verificationToken = () => {
  const message = getTestAuthEmails().at(-1);
  if (!message) throw new Error("Test message was not captured");
  const url = message.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("Test link was not found");
  return new URL(url).searchParams.get("token") ?? "";
};

describe("seller account authentication", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    clearTestAuthEmails();
    resetAuthRateLimitsForTests();
  });
  afterEach(async () => resetTestDatabase());

  it("registers a normalized, unverified account and activates it only after a single-use email verification", async () => {
    const response = await request(app).post("/api/v1/creator/register").send({ name: "New seller", email: "  SHOP@EXAMPLE.COM ", password });
    expect(response.status).toBe(202);
    expect(response.body.data.message).toMatch(/If the details can be used/);
    const creator = await prisma.creator.findFirst({ where: { email: null }, orderBy: { createdAt: "desc" } });
    expect(creator?.emailVerifiedAt).toBeNull();
    expect(creator?.passwordHash).toBeNull();
    expect(creator?.accessCodeHash).toBeTruthy();
    const pending = await prisma.creatorAuthToken.findUnique({ where: { creatorId: creator!.id } });
    expect(pending?.pendingEmail).toBe("shop@example.com");
    expect(pending?.tokenHash).not.toBe(verificationToken());

    const beforeVerification = await request(app).post("/api/v1/creator/password/login").send({ email: "shop@example.com", password });
    expect(beforeVerification.status).toBe(401);
    const verified = await request(app).post("/api/v1/creator/verify-email").send({ token: verificationToken() });
    expect(verified.status).toBe(200);
    expect(verified.headers["set-cookie"][0]).toMatch(/HttpOnly/i);
    const updated = await prisma.creator.findUniqueOrThrow({ where: { id: creator!.id } });
    expect(updated.email).toBe("shop@example.com");
    expect(updated.emailVerifiedAt).toBeInstanceOf(Date);
    expect(updated.passwordHash).not.toBe(password);
    expect(await prisma.creatorAuthToken.count()).toBe(0);
    const replay = await request(app).post("/api/v1/creator/verify-email").send({ token: verificationToken() });
    expect(replay.status).toBe(400);
  });

  it("claims the existing Creator identity and leaves its access code usable until verification", async () => {
    const accessCode = `LO-${randomUUID()}`;
    const creator = await prisma.creator.create({ data: { name: "Existing seller", accessCodeHash: await hashAccessCode(accessCode) } });
    const store = await prisma.store.create({ data: { creatorId: creator.id, name: "Existing Store", slug: `existing-${randomUUID()}` } });
    const started = await request(app).post("/api/v1/creator/claim").send({ accessCode, email: "claim@example.com", password });
    expect(started.status).toBe(202);
    const pendingLogin = await request(app).post("/api/v1/creator/access").send({ accessCode });
    expect(pendingLogin.status).toBe(200);
    const pendingCookie = pendingLogin.headers["set-cookie"][0].split(";")[0];

    const verified = await request(app).post("/api/v1/creator/verify-email").send({ token: verificationToken() });
    expect(verified.status).toBe(200);
    expect(verified.body.data.id).toBe(creator.id);
    expect(await prisma.store.findUnique({ where: { id: store.id }, select: { creatorId: true } })).toEqual({ creatorId: creator.id });
    expect((await request(app).get("/api/v1/creator/me").set("Cookie", pendingCookie)).status).toBe(401);
    expect((await request(app).post("/api/v1/creator/access").send({ accessCode })).status).toBe(401);
    expect((await request(app).post("/api/v1/creator/password/login").send({ email: "CLAIM@example.com", password })).status).toBe(200);
  });

  it("does not claim for an invalid code and returns generic responses for duplicate email registration", async () => {
    const invalid = await request(app).post("/api/v1/creator/claim").send({ accessCode: "invalid", email: "x@example.com", password });
    expect(invalid.status).toBe(202);
    expect(await prisma.creatorAuthToken.count()).toBe(0);
    await request(app).post("/api/v1/creator/register").send({ name: "Seller", email: "same@example.com", password });
    const duplicate = await request(app).post("/api/v1/creator/register").send({ name: "Seller", email: " SAME@example.com ", password });
    expect(duplicate.status).toBe(202);
    expect(duplicate.body).toEqual({ data: { message: invalid.body.data.message } });
    expect(await prisma.creatorAuthToken.count()).toBe(1);
  });

  it("does not create duplicate Creator identities for concurrent registration with one email", async () => {
    const [first, second] = await Promise.all([
      request(app).post("/api/v1/creator/register").send({ name: "Seller A", email: "race@example.com", password }),
      request(app).post("/api/v1/creator/register").send({ name: "Seller B", email: " RACE@example.com ", password }),
    ]);
    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(await prisma.creator.count()).toBe(1);
    expect(await prisma.creatorAuthToken.count()).toBe(1);
  });

  it("rejects expired verification links", async () => {
    await request(app).post("/api/v1/creator/register").send({ name: "Seller", email: "expired@example.com", password });
    await prisma.creatorAuthToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const response = await request(app).post("/api/v1/creator/verify-email").send({ token: verificationToken() });
    expect(response.status).toBe(400);
    expect(await prisma.creatorAuthToken.count()).toBe(0);
  });

  it("uses generic password-reset responses and consumes reset tokens while revoking sessions", async () => {
    await request(app).post("/api/v1/creator/register").send({ name: "Seller", email: "reset@example.com", password });
    await request(app).post("/api/v1/creator/verify-email").send({ token: verificationToken() });
    const login = await request(app).post("/api/v1/creator/password/login").send({ email: "reset@example.com", password });
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    const unknown = await request(app).post("/api/v1/creator/password/forgot").send({ email: "nobody@example.com" });
    const known = await request(app).post("/api/v1/creator/password/forgot").send({ email: "RESET@example.com" });
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    const resetToken = verificationToken();
    const reset = await request(app).post("/api/v1/creator/password/reset").send({ token: resetToken, password: "NewSellerPassword456" });
    expect(reset.status).toBe(204);
    expect((await request(app).get("/api/v1/creator/me").set("Cookie", cookie)).status).toBe(401);
    expect((await request(app).post("/api/v1/creator/password/reset").send({ token: resetToken, password: "OtherSellerPassword789" })).status).toBe(400);
    expect((await request(app).post("/api/v1/creator/password/login").send({ email: "reset@example.com", password: "NewSellerPassword456" })).status).toBe(200);
  });

  it("rejects expired password-reset links", async () => {
    await request(app).post("/api/v1/creator/register").send({ name: "Seller", email: "expired-reset@example.com", password });
    await request(app).post("/api/v1/creator/verify-email").send({ token: verificationToken() });
    await request(app).post("/api/v1/creator/password/forgot").send({ email: "expired-reset@example.com" });
    const resetToken = verificationToken();
    await prisma.creatorPasswordResetToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await request(app).post("/api/v1/creator/password/reset").send({ token: resetToken, password: "NewSellerPassword456" })).status).toBe(400);
  });

  it("enforces a per-address request limit", async () => {
    for (let index = 0; index < 10; index += 1) {
      expect((await request(app).post("/api/v1/creator/password/forgot").send({ email: `none${index}@example.com` })).status).toBe(202);
    }
    expect((await request(app).post("/api/v1/creator/password/forgot").send({ email: "last@example.com" })).status).toBe(429);
  });

  it("fails safely when production email delivery is not configured", async () => {
    const keys = ["NODE_ENV", "SMTP_HOST", "SMTP_PORT", "SMTP_USERNAME", "SMTP_PASSWORD", "SMTP_SECURE", "SMTP_REQUIRE_TLS", "SMTP_FROM", "PUBLIC_APP_URL"] as const;
    const previous = new Map(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.NODE_ENV = "production";
      for (const key of keys.slice(1)) delete process.env[key];
      const response = await request(app).post("/api/v1/creator/register").send({ name: "Seller", email: "mail@example.com", password });
      expect(response.status).toBe(503);
      expect(await prisma.creator.count()).toBe(0);
    } finally {
      for (const key of keys) {
        const value = previous.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});
