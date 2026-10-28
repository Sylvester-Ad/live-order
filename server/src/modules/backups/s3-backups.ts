import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { verifySqliteDatabase } from "./sqlite-backups.js";

export const SQLITE_BACKUP_S3_PREFIX = "liveorder/backups/sqlite";

function validateBackupPrefix(prefix: string) {
  if (prefix !== SQLITE_BACKUP_S3_PREFIX) {
    throw new Error(`SQLite backups must use the ${SQLITE_BACKUP_S3_PREFIX} S3 prefix`);
  }
}

export type S3BackupConfiguration = {
  bucket: string;
  prefix: string;
  region: string;
};

export function getS3BackupConfiguration(environment: NodeJS.ProcessEnv = process.env): S3BackupConfiguration {
  const bucket = environment.LIVEORDER_BACKUP_BUCKET?.trim();
  if (!bucket) throw new Error("LIVEORDER_BACKUP_BUCKET must be configured");

  const prefix = (environment.LIVEORDER_BACKUP_PREFIX?.trim() || SQLITE_BACKUP_S3_PREFIX).replace(/\/+$/, "");
  validateBackupPrefix(prefix);

  const region = environment.AWS_REGION?.trim() || environment.AWS_DEFAULT_REGION?.trim();
  if (!region) throw new Error("AWS_REGION must be configured");

  return { bucket, prefix, region };
}

export function createBackupObjectKey(
  prefix: string,
  now = new Date(),
  uniqueId = randomUUID(),
) {
  validateBackupPrefix(prefix);
  if (!/^[A-Za-z0-9-]+$/.test(uniqueId)) {
    throw new Error("Backup object identifiers may contain only letters, numbers, and hyphens");
  }
  const timestamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return `${prefix}/liveorder-${timestamp}-${uniqueId}.sqlite`;
}

export async function uploadSqliteBackup(
  backupPath: string,
  configuration: S3BackupConfiguration,
  send: (command: PutObjectCommand) => Promise<unknown>,
) {
  validateBackupPrefix(configuration.prefix);
  verifySqliteDatabase(backupPath);
  const backupStats = await lstat(backupPath);
  if (!backupStats.isFile()) throw new Error("Backup path must be a regular file");

  const key = createBackupObjectKey(configuration.prefix);
  const body = createReadStream(backupPath);
  try {
    await send(new PutObjectCommand({
      Bucket: configuration.bucket,
      Key: key,
      Body: body,
      ContentLength: backupStats.size,
      ContentType: "application/vnd.sqlite3",
      ServerSideEncryption: "AES256",
    }));
  } catch (error) {
    const code = error instanceof Error ? ` (${error.name})` : "";
    throw new Error(`S3 backup upload failed${code}; the local backup was retained`, { cause: error });
  } finally {
    body.destroy();
  }

  return key;
}

export function createS3BackupSender(client: S3Client) {
  return (command: PutObjectCommand) => client.send(command);
}
