import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertManagedBackupPath,
  assertPendingBackupCapacity,
  finalizeLocalBackupUpload,
  markLocalBackupUploaded,
  pruneUploadedLocalBackups,
} from "../../src/modules/backups/local-backup-retention.js";

describe("local SQLite backup retention", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "liveorder-local-backups-"));
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  async function createBackup(name: string, ageDays = 0) {
    const backupPath = path.join(directory, name);
    await fs.writeFile(backupPath, "test backup");
    const timestamp = Date.now() - ageDays * 24 * 60 * 60 * 1000;
    await fs.utimes(backupPath, timestamp / 1000, timestamp / 1000);
    return backupPath;
  }

  it("prunes only expired uploaded backups inside the dedicated directory", async () => {
    const oldUploaded = await createBackup("liveorder-20260101T000000Z.sqlite", 20);
    const recentUploaded = await createBackup("liveorder-20261024T000000Z.sqlite", 1);
    const failedUpload = await createBackup("liveorder-20260102T000000Z.sqlite", 20);
    const unrelated = await createBackup("notes.txt", 60);
    await markLocalBackupUploaded(oldUploaded, directory);
    await markLocalBackupUploaded(recentUploaded, directory);

    await expect(pruneUploadedLocalBackups(directory, {
      activeDatabasePath: path.join(directory, "liveorder.db"),
    })).resolves.toBe(1);

    await expect(fs.access(oldUploaded)).rejects.toThrow();
    await expect(fs.access(path.join(directory, `.${path.basename(oldUploaded)}.uploaded`))).rejects.toThrow();
    await expect(fs.access(recentUploaded)).resolves.toBeUndefined();
    await expect(fs.access(failedUpload)).resolves.toBeUndefined();
    await expect(fs.access(unrelated)).resolves.toBeUndefined();
  });

  it("caps pending artifacts instead of deleting failed uploads", async () => {
    for (let index = 0; index < 7; index += 1) {
      await createBackup(`liveorder-20261024T00000${index}Z.sqlite`);
    }

    await expect(assertPendingBackupCapacity(directory)).rejects.toThrow(/unuploaded local backups/);
    await expect(fs.readdir(directory)).resolves.toHaveLength(7);
  });

  it("refuses managed cleanup of the configured active database", async () => {
    const activeDatabase = await createBackup("liveorder-20260101T000000Z.sqlite", 20);
    await markLocalBackupUploaded(activeDatabase, directory);

    await expect(pruneUploadedLocalBackups(directory, { activeDatabasePath: activeDatabase }))
      .rejects.toThrow(/active SQLite database/);
    await expect(fs.access(activeDatabase)).resolves.toBeUndefined();
  });

  it("limits managed paths to recognized files directly inside the backup directory", () => {
    expect(() => assertManagedBackupPath(path.join(directory, "other", "liveorder-20261024T000000Z.sqlite"), directory))
      .toThrow(/dedicated backup directory/);
    expect(() => assertManagedBackupPath(path.join(directory, "notes.txt"), directory))
      .toThrow(/LiveOrder backup filename/);
  });

  it("logs retention failures without misreporting a confirmed upload as failed", async () => {
    const uploadedFile = await createBackup("liveorder-20260101T000000Z.sqlite", 20);
    const logger = { error: vi.fn() };

    await expect(finalizeLocalBackupUpload(uploadedFile, directory, uploadedFile, logger))
      .resolves.toEqual({ cleanupSucceeded: false, removedCount: 0 });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("S3 upload succeeded"));
    await expect(fs.access(uploadedFile)).resolves.toBeUndefined();
  });
});
