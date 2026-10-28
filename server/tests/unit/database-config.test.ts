import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findRepositoryRoot, getDatabaseConfiguration, repositoryRoot } from "../../src/config/database.js";

describe("SQLite database configuration", () => {
  it("finds the same repository root from compiled output paths", () => {
    const compiledConfigDirectory = `${repositoryRoot}/server/dist/server/src/config`;

    expect(findRepositoryRoot(compiledConfigDirectory)).toBe(repositoryRoot);
  });

  it("anchors relative database paths at the repository root", () => {
    const config = getDatabaseConfiguration({
      NODE_ENV: "development",
      LIVEORDER_DATABASE_PATH: "./data/release-check.db",
    });

    expect(config.path).toBe(`${repositoryRoot}/data/release-check.db`);
    expect(fileURLToPath(config.url)).toBe(config.path);
  });

  it("accepts an explicitly configured absolute production path", () => {
    const config = getDatabaseConfiguration({
      NODE_ENV: "production",
      LIVEORDER_DATABASE_PATH: "/var/lib/liveorder/liveorder.db",
    });

    expect(config.path).toBe("/var/lib/liveorder/liveorder.db");
    expect(fileURLToPath(config.url)).toBe(config.path);
  });

  it("rejects missing and relative production paths", () => {
    expect(() => getDatabaseConfiguration({ NODE_ENV: "production" })).toThrow(
      "LIVEORDER_DATABASE_PATH must be set to an absolute path in production",
    );
    expect(() => getDatabaseConfiguration({
      NODE_ENV: "production",
      LIVEORDER_DATABASE_PATH: "./data/live.db",
    })).toThrow("LIVEORDER_DATABASE_PATH must be an absolute path in production");
  });

  it("rejects malformed database paths", () => {
    expect(() => getDatabaseConfiguration({
      NODE_ENV: "production",
      LIVEORDER_DATABASE_PATH: "/var/lib/liveorder/\0database.db",
    })).toThrow("LIVEORDER_DATABASE_PATH contains an invalid character");
  });
});
