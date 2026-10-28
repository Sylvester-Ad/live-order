import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/app.js";
import { prisma } from "../src/database/prisma.js";

describe("health endpoints", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps liveness independent of database connectivity", async () => {
    const query = vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("database unavailable"));

    const response = await request(app).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
    expect(query).not.toHaveBeenCalled();
  });

  it("reports readiness when SQLite responds", async () => {
    vi.spyOn(prisma, "$queryRaw").mockResolvedValue([{ result: 1 }]);

    const response = await request(app).get("/api/health/ready");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: "ok" } });
  });

  it("returns a generic unavailable response when SQLite cannot be reached", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValue(new Error("/private/database/path"));

    const response = await request(app).get("/api/health/ready");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: {
        code: "SERVICE_NOT_READY",
        message: "A required service is unavailable",
      },
    });
    expect(JSON.stringify(response.body)).not.toContain("/private/database/path");
  });
});
