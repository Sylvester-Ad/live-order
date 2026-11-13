type PendingProductImageUploadAttempt = {
  idempotencyKey: string;
  fileFingerprint: string;
};

export type StoredProductImageUploadAttempt = PendingProductImageUploadAttempt;

export class PendingProductImageUploadStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PendingProductImageUploadStorageError";
  }
}

export function pendingProductImageUploadStorageKey(
  creatorId: string,
  liveId: string,
  productId: string,
) {
  return `liveorder:pending-product-image-uploads:${creatorId}:${liveId}:${productId}`;
}

export async function getOrCreateProductImageUploadKey(
  creatorId: string,
  liveId: string,
  productId: string,
  file: File,
) {
  const fileFingerprint = await fingerprintFile(file);
  const key = pendingProductImageUploadStorageKey(creatorId, liveId, productId);
  const attempts = loadAttempts(key);
  const existing = attempts.find((attempt) => attempt.fileFingerprint === fileFingerprint);
  if (existing) return existing.idempotencyKey;

  const idempotencyKey = globalThis.crypto.randomUUID();
  saveAttempts(key, [...attempts, { idempotencyKey, fileFingerprint }]);
  return idempotencyKey;
}

export async function findProductImageUploadAttempt(
  creatorId: string,
  liveId: string,
  productId: string,
  file: File,
) {
  const fileFingerprint = await fingerprintFile(file);
  const attempts = loadAttempts(pendingProductImageUploadStorageKey(creatorId, liveId, productId));
  return attempts.find((attempt) => attempt.fileFingerprint === fileFingerprint) ?? null;
}

export function listProductImageUploadAttempts(
  creatorId: string,
  liveId: string,
  productId: string,
) {
  return loadAttempts(pendingProductImageUploadStorageKey(creatorId, liveId, productId));
}

export function clearProductImageUploadAttempt(
  creatorId: string,
  liveId: string,
  productId: string,
  idempotencyKey: string,
) {
  const key = pendingProductImageUploadStorageKey(creatorId, liveId, productId);
  const attempts = loadAttempts(key);
  saveAttempts(key, attempts.filter((attempt) => attempt.idempotencyKey !== idempotencyKey));
}

async function fingerprintFile(file: File) {
  let digest: ArrayBuffer;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = new TextEncoder().encode(`${file.type}\0`);
    const input = new Uint8Array(mimeType.length + bytes.length);
    input.set(mimeType);
    input.set(bytes, mimeType.length);
    digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  } catch (error) {
    throw new PendingProductImageUploadStorageError(
      "The selected image could not be prepared for a safe retry.",
      { cause: error },
    );
  }

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function loadAttempts(key: string): PendingProductImageUploadAttempt[] {
  let serialized: string | null;
  try {
    serialized = globalThis.sessionStorage.getItem(key);
  } catch (error) {
    throw new PendingProductImageUploadStorageError(
      "Saved image upload recovery data could not be read from this browser tab.",
      { cause: error },
    );
  }

  if (serialized === null) return [];

  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new PendingProductImageUploadStorageError(
      "Saved image upload recovery data is damaged and cannot be safely retried.",
      { cause: error },
    );
  }

  if (!Array.isArray(value) || !value.every(isPendingProductImageUploadAttempt)) {
    throw new PendingProductImageUploadStorageError(
      "Saved image upload recovery data is invalid and cannot be safely retried.",
    );
  }

  return value;
}

function saveAttempts(key: string, attempts: PendingProductImageUploadAttempt[]) {
  try {
    if (attempts.length === 0) {
      globalThis.sessionStorage.removeItem(key);
    } else {
      globalThis.sessionStorage.setItem(key, JSON.stringify(attempts));
    }
  } catch (error) {
    throw new PendingProductImageUploadStorageError(
      "Image upload recovery data could not be saved or cleared.",
      { cause: error },
    );
  }
}

function isPendingProductImageUploadAttempt(value: unknown): value is PendingProductImageUploadAttempt {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;

  return typeof record.idempotencyKey === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.idempotencyKey) &&
    typeof record.fileFingerprint === "string" &&
    /^[0-9a-f]{64}$/.test(record.fileFingerprint);
}
