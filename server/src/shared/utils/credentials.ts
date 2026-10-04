import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);

export async function hashAccessCode(accessCode: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = (await scrypt(accessCode, salt, 64)) as Buffer;

  return `${salt}:${derivedKey.toString("hex")}`;
}

export async function verifyAccessCode(
  accessCode: string,
  storedHash: string,
): Promise<boolean> {
  const [salt, key] = storedHash.split(":");

  if (!salt || !key) {
    return false;
  }

  const derivedKey = (await scrypt(accessCode, salt, 64)) as Buffer;
  const storedKey = Buffer.from(key, "hex");

  return (
    storedKey.length === derivedKey.length &&
    crypto.timingSafeEqual(storedKey, derivedKey)
  );
}