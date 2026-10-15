import cors from "cors";
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createCorsOptions } from "../src/config/cors.js";

function createTestApp() {
  const app = express();
  app.use(cors(createCorsOptions("https://seller.example.com, https://preview.example.com")));
  app.get("/health", (_req, res) => res.json({ status: "ok" }));
  return app;
}

describe("credentialed CORS configuration", () => {
  it("reflects an explicitly allowed origin and allows credentials", async () => {
    const response = await request(createTestApp())
      .get("/health")
      .set("Origin", "https://seller.example.com");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("https://seller.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers.vary).toContain("Origin");
  });

  it("does not grant CORS access to an origin outside the configured list", async () => {
    const response = await request(createTestApp())
      .get("/health")
      .set("Origin", "https://untrusted.example.net");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("handles credentialed preflight requests for allowed origins", async () => {
    const response = await request(createTestApp())
      .options("/health")
      .set("Origin", "https://preview.example.com")
      .set("Access-Control-Request-Method", "PATCH");

    expect(response.status).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("https://preview.example.com");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
  });
});
