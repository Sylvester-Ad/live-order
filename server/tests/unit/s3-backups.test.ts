import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLiveOrderSqliteFixture } from "../helpers/sqlite-backup-fixture.js";
import {
  createBackupObjectKey,
  getS3BackupConfiguration,
  uploadSqliteBackup,
} from "../../src/modules/backups/s3-backups.js";

describe("S3 SQLite backup upload", () => {
  let directory: string;
  let backupPath: string;

  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "liveorder-s3-backup-test-"));
    backupPath = createLiveOrderSqliteFixture(directory, "backup.sqlite");
  });

  afterEach(async () => {
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("validates bucket and region configuration and defaults the backup namespace", () => {
    expect(() => getS3BackupConfiguration({})).toThrow(/LIVEORDER_BACKUP_BUCKET/);
    expect(() => getS3BackupConfiguration({ LIVEORDER_BACKUP_BUCKET: "private" })).toThrow(/AWS_REGION/);
    expect(getS3BackupConfiguration({
      LIVEORDER_BACKUP_BUCKET: "private-backups",
      AWS_REGION: "af-south-1",
    })).toEqual({
      bucket: "private-backups",
      prefix: "liveorder/backups/sqlite",
      region: "af-south-1",
    });
    expect(() => getS3BackupConfiguration({
      LIVEORDER_BACKUP_BUCKET: "private-backups",
      AWS_REGION: "af-south-1",
      LIVEORDER_BACKUP_PREFIX: "../other",
    })).toThrow(/must use the liveorder\/backups\/sqlite S3 prefix/);
    expect(() => getS3BackupConfiguration({
      LIVEORDER_BACKUP_BUCKET: "private-backups",
      AWS_REGION: "af-south-1",
      LIVEORDER_BACKUP_PREFIX: "liveorder/backups/other",
    })).toThrow(/must use the liveorder\/backups\/sqlite S3 prefix/);
  });

  it("generates a unique timestamped key under the configured prefix", () => {
    const date = new Date("2026-10-24T14:05:06.007Z");
    const first = createBackupObjectKey("liveorder/backups/sqlite", date, "first-id");
    const second = createBackupObjectKey("liveorder/backups/sqlite", date, "second-id");

    expect(first).toBe("liveorder/backups/sqlite/liveorder-20261024T140506Z-first-id.sqlite");
    expect(second).not.toBe(first);
    expect(() => createBackupObjectKey("liveorder/backups/elsewhere", date)).toThrow(/must use the liveorder\/backups\/sqlite S3 prefix/);
    expect(() => createBackupObjectKey("liveorder/backups/sqlite", date, "../outside")).toThrow(/identifiers may contain only/);
  });

  it("uploads only validated backups with server-side encryption and no public ACL", async () => {
    const send = vi.fn(async (_command: PutObjectCommand) => undefined);
    const key = await uploadSqliteBackup(backupPath, {
      bucket: "private-backups",
      prefix: "liveorder/backups/sqlite",
      region: "af-south-1",
    }, send);

    expect(key).toMatch(/^liveorder\/backups\/sqlite\/liveorder-\d{8}T\d{6}Z-.+\.sqlite$/);
    const command = send.mock.calls[0]?.[0];
    expect(command?.input).toMatchObject({
      Bucket: "private-backups",
      Key: key,
      ContentType: "application/vnd.sqlite3",
      ServerSideEncryption: "AES256",
    });
    expect(command?.input.ACL).toBeUndefined();
    expect(await fs.stat(backupPath)).toBeDefined();
  });

  it("keeps the local backup when S3 upload fails", async () => {
    const send = vi.fn(async (_command: PutObjectCommand) => {
      throw new Error("simulated S3 failure");
    });

    await expect(uploadSqliteBackup(backupPath, {
      bucket: "private-backups",
      prefix: "liveorder/backups/sqlite",
      region: "af-south-1",
    }, send)).rejects.toThrow(/local backup was retained/);
    await expect(fs.stat(backupPath)).resolves.toBeDefined();
  });

  it("rejects an invalid backup before issuing an S3 request", async () => {
    const invalidPath = path.join(directory, "invalid.sqlite");
    await fs.writeFile(invalidPath, "invalid");
    const send = vi.fn(async (_command: PutObjectCommand) => undefined);

    await expect(uploadSqliteBackup(invalidPath, {
      bucket: "private-backups",
      prefix: "liveorder/backups/sqlite",
      region: "af-south-1",
    }, send)).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a symlinked backup before issuing an S3 request", async () => {
    const symlinkPath = path.join(directory, "linked.sqlite");
    await fs.symlink(backupPath, symlinkPath);
    const send = vi.fn(async (_command: PutObjectCommand) => undefined);
    await expect(uploadSqliteBackup(symlinkPath, {
      bucket: "private-backups",
      prefix: "liveorder/backups/sqlite",
      region: "af-south-1",
    }, send)).rejects.toThrow(/regular file/);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a non-approved prefix before issuing an S3 request", async () => {
    const send = vi.fn(async (_command: PutObjectCommand) => undefined);
    await expect(uploadSqliteBackup(backupPath, {
      bucket: "private-backups",
      prefix: "liveorder/backups/other",
      region: "af-south-1",
    }, send)).rejects.toThrow(/must use the liveorder\/backups\/sqlite S3 prefix/);
    expect(send).not.toHaveBeenCalled();
  });
});
