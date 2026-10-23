import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../src/shared/errors/error-handler.js";

describe("unhandled error responses", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("logs structured error metadata and hides internals in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = express();
    app.get("/private/:id", () => {
      throw new Error("customer phone 0241234567 and database password");
    });
    app.use(errorHandler);

    const response = await request(app).get("/private/example");

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain("customer phone");
    expect(JSON.stringify(response.body)).not.toContain("database password");
    expect(errorLog).toHaveBeenCalledOnce();
    const logged = String(errorLog.mock.calls[0]?.[0]);
    expect(logged).toContain('"event":"http.unhandled_error"');
    expect(logged).toContain('"route":"/private/:id"');
    expect(logged).not.toContain("0241234567");
    expect(logged).not.toContain("database password");
  });
});
