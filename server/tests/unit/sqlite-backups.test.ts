import Database from "better-sqlite3";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLiveOrderSqliteFixture } from "../helpers/sqlite-backup-fixture.js";
import {
  createSqliteBackup,
  restoreSqliteBackup,
  verifySqliteDatabase,
} from "../../src/modules/backups/sqlite-backups.js";

describe("SQLite backup and restore", () => {
  let directory: string;
  let source: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "liveorder-backup-test-"));
    source = createLiveOrderSqliteFixture(directory);
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("creates an online backup containing data and validates integrity and schema", async () => {
    const destination = path.join(directory, "nested", "backup.sqlite");

    await expect(createSqliteBackup(source, destination)).resolves.toBe(destination);
    expect(() => verifySqliteDatabase(destination)).not.toThrow();

    const backup = new Database(destination, { readonly: true });
    expect(backup.prepare('SELECT "name" FROM "Creator" WHERE "id" = ?').get("fixture-id"))
      .toEqual({ name: "Fixture creator" });
    backup.close();
    expect((await fs.stat(destination)).mode & 0o777).toBe(0o600);
  });

  it("produces a valid snapshot while another SQLite connection is writing", async () => {
    const writer = new Database(source);
    writer.pragma("journal_mode = WAL");
    writer.exec('CREATE TABLE "BackupLoad" ("id" INTEGER PRIMARY KEY, "payload" TEXT NOT NULL)');
    const insertLoad = writer.prepare('INSERT INTO "BackupLoad" ("payload") VALUES (?)');
    const seed = writer.transaction(() => {
      for (let index = 0; index < 1200; index += 1) insertLoad.run("x".repeat(2048));
    });
    seed();

    let writeCount = 0;
    const insertConcurrent = writer.prepare('INSERT INTO "BackupLoad" ("payload") VALUES (?)');
    const interval = setInterval(() => {
      insertConcurrent.run(`concurrent-${writeCount}`);
      writeCount += 1;
      if (writeCount >= 3) clearInterval(interval);
    }, 1);
    const destination = path.join(directory, "concurrent-backup.sqlite");
    try {
      await createSqliteBackup(source, destination);
    } finally {
      clearInterval(interval);
      writer.close();
    }

    expect(writeCount).toBeGreaterThan(0);
    expect(() => verifySqliteDatabase(destination)).not.toThrow();
    const backup = new Database(destination, { readonly: true });
    const row = backup.prepare('SELECT count(*) AS count FROM "BackupLoad"').get() as { count: number };
    expect(row.count).toBeGreaterThanOrEqual(1200);
    expect(row.count).toBeLessThanOrEqual(1200 + writeCount);
    backup.close();
  });

  it("rejects a missing or invalid source and removes incomplete outputs", async () => {
    const missingDestination = path.join(directory, "missing-backup.sqlite");
    await expect(createSqliteBackup(path.join(directory, "missing.db"), missingDestination)).rejects.toThrow();
    await expect(fs.access(missingDestination)).rejects.toThrow();

    const invalidSource = path.join(directory, "invalid.db");
    await fs.writeFile(invalidSource, "not a SQLite database");
    const invalidDestination = path.join(directory, "invalid-backup.sqlite");
    await expect(createSqliteBackup(invalidSource, invalidDestination)).rejects.toThrow();
    await expect(fs.access(invalidDestination)).rejects.toThrow();
  });

  it("rejects a structurally valid SQLite file without the LiveOrder schema", async () => {
    const unrelatedDatabase = path.join(directory, "unrelated.db");
    const database = new Database(unrelatedDatabase);
    database.exec("CREATE TABLE unrelated (id TEXT PRIMARY KEY)");
    database.close();

    expect(() => verifySqliteDatabase(unrelatedDatabase)).toThrow(/expected LiveOrder schema/);
  });

  it("rejects a database with LiveOrder table names but incompatible columns", async () => {
    const incompatibleDatabase = path.join(directory, "incompatible.db");
    const database = new Database(incompatibleDatabase);
    for (const table of ["Creator", "CreatorSession", "Live", "Product", "ProductImage", "Order", "OrderItem", "_prisma_migrations"]) {
      database.exec(`CREATE TABLE "${table}" ("id" TEXT PRIMARY KEY, "payload" TEXT)`);
    }
    database.close();

    expect(() => verifySqliteDatabase(incompatibleDatabase)).toThrow(/expected LiveOrder schema/);
  });

  it("rejects databases with foreign-key violations", async () => {
    const invalidDatabase = new Database(source);
    invalidDatabase.pragma("foreign_keys = OFF");
    invalidDatabase.prepare(
      'INSERT INTO "Product" ("id", "liveId", "name", "price", "stockQuantity") VALUES (?, ?, ?, ?, ?)',
    ).run("orphan-product", "missing-live", "Orphan", 100, 1);
    invalidDatabase.close();

    expect(() => verifySqliteDatabase(source)).toThrow(/foreign-key violations/);
  });

  it("refuses to replace an existing backup", async () => {
    const destination = path.join(directory, "existing.sqlite");
    await fs.writeFile(destination, "keep this file");

    await expect(createSqliteBackup(source, destination)).rejects.toThrow(/already exists/);
    await expect(fs.readFile(destination, "utf8")).resolves.toBe("keep this file");
  });

  it("restores to a new database, preserves the source, and refuses overwrite without opt-in", async () => {
    const backupPath = path.join(directory, "backup.sqlite");
    const destination = path.join(directory, "restored", "restored.db");
    await createSqliteBackup(source, backupPath);
    const sourceBytes = await fs.readFile(backupPath);

    await restoreSqliteBackup(backupPath, destination);
    expect(() => verifySqliteDatabase(destination)).not.toThrow();
    await expect(fs.readFile(backupPath)).resolves.toEqual(sourceBytes);

    await expect(restoreSqliteBackup(backupPath, destination)).rejects.toThrow(/already exists/);
    const restored = new Database(destination, { readonly: true });
    expect(restored.prepare('SELECT "name" FROM "Creator" WHERE "id" = ?').get("fixture-id"))
      .toEqual({ name: "Fixture creator" });
    restored.close();
  });

  it("validates before restore and protects the configured active database path", async () => {
    const invalidBackup = path.join(directory, "invalid-backup.db");
    await fs.writeFile(invalidBackup, "invalid");
    const destination = path.join(directory, "restored.db");
    await expect(restoreSqliteBackup(invalidBackup, destination)).rejects.toThrow();
    await expect(fs.access(destination)).rejects.toThrow();

    const validBackup = path.join(directory, "valid-backup.db");
    await createSqliteBackup(source, validBackup);
    await expect(restoreSqliteBackup(validBackup, source, { activeDatabasePath: source }))
      .rejects.toThrow(/active database/);
    expect(() => verifySqliteDatabase(source)).not.toThrow();
  });

  it("protects the active database when the configured path uses a file symlink", async () => {
    const backupPath = path.join(directory, "valid-backup.db");
    const activePath = path.join(directory, "active.db");
    const activeAlias = path.join(directory, "active-alias.db");
    await createSqliteBackup(source, backupPath);
    await fs.copyFile(source, activePath);
    await fs.symlink(activePath, activeAlias);

    await expect(restoreSqliteBackup(backupPath, activePath, {
      replaceExisting: true,
      activeDatabasePath: activeAlias,
    })).rejects.toThrow(/active database/);
  });

  it("protects the active database through a symlinked destination directory", async () => {
    const backupPath = path.join(directory, "valid-backup.db");
    const activeDirectory = path.join(directory, "active-directory");
    const directoryAlias = path.join(directory, "directory-alias");
    const activePath = path.join(activeDirectory, "liveorder.db");
    await fs.mkdir(activeDirectory);
    await createSqliteBackup(source, backupPath);
    await fs.copyFile(source, activePath);
    await fs.symlink(activeDirectory, directoryAlias, "dir");

    await expect(restoreSqliteBackup(backupPath, path.join(directoryAlias, "liveorder.db"), {
      replaceExisting: true,
      activeDatabasePath: activePath,
    })).rejects.toThrow(/active database/);
  });

  it("protects the active database through a hard-link alias", async () => {
    const backupPath = path.join(directory, "valid-backup.db");
    const activePath = path.join(directory, "active.db");
    const activeAlias = path.join(directory, "active-hardlink.db");
    await createSqliteBackup(source, backupPath);
    await fs.copyFile(source, activePath);
    await fs.link(activePath, activeAlias);

    await expect(restoreSqliteBackup(backupPath, activeAlias, {
      replaceExisting: true,
      activeDatabasePath: activePath,
    })).rejects.toThrow(/active database/);
  });

  it("requires explicit opt-in before replacing an existing regular database", async () => {
    const backupPath = path.join(directory, "backup.sqlite");
    const destination = path.join(directory, "destination.sqlite");
    await createSqliteBackup(source, backupPath);
    await fs.writeFile(destination, "old destination");

    await restoreSqliteBackup(backupPath, destination, { replaceExisting: true });
    expect(() => verifySqliteDatabase(destination)).not.toThrow();
    expect((await fs.stat(destination)).mode & 0o777).toBe(0o600);
  });

  it("refuses replacement when destination WAL sidecars exist", async () => {
    const backupPath = path.join(directory, "backup.sqlite");
    const destination = path.join(directory, "destination.sqlite");
    await createSqliteBackup(source, backupPath);
    await fs.copyFile(source, destination);
    await fs.writeFile(`${destination}-wal`, "sidecar");

    await expect(restoreSqliteBackup(backupPath, destination, { replaceExisting: true }))
      .rejects.toThrow(/sidecar files/);
    expect((await fs.stat(destination)).isFile()).toBe(true);
  });

  it("refuses a new restore destination when stale SQLite sidecars exist", async () => {
    const backupPath = path.join(directory, "backup.sqlite");
    const destination = path.join(directory, "new-destination.sqlite");
    await createSqliteBackup(source, backupPath);
    await fs.writeFile(`${destination}-wal`, "stale sidecar");

    await expect(restoreSqliteBackup(backupPath, destination)).rejects.toThrow(/sidecar files/);
    await expect(fs.access(destination)).rejects.toThrow();
  });
});
