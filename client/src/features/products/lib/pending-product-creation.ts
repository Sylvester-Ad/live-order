import type { CreateProductInput } from "../api/products-api";

export type PendingProductCreation = {
  idempotencyKey: string;
  input: CreateProductInput;
};

export class PendingProductCreationStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PendingProductCreationStorageError";
  }
}

export function pendingProductCreationStorageKey(creatorId: string, liveId: string) {
  return `liveorder:pending-product-creation:${creatorId}:${liveId}`;
}

export function createProductCreationKey() {
  return globalThis.crypto.randomUUID();
}

export function loadPendingProductCreation(creatorId: string, liveId: string): PendingProductCreation | null {
  let serialized: string | null;
  try {
    serialized = globalThis.sessionStorage.getItem(pendingProductCreationStorageKey(creatorId, liveId));
  } catch (error) {
    throw new PendingProductCreationStorageError(
      "Saved product recovery data could not be read from this browser tab.",
      { cause: error },
    );
  }

  if (serialized === null) return null;

  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new PendingProductCreationStorageError(
      "Saved product recovery data is damaged and cannot be safely retried.",
      { cause: error },
    );
  }

  if (!isPendingProductCreation(value)) {
    throw new PendingProductCreationStorageError(
      "Saved product recovery data is invalid and cannot be safely retried.",
    );
  }

  return value;
}

export function savePendingProductCreation(creatorId: string, liveId: string, attempt: PendingProductCreation) {
  try {
    globalThis.sessionStorage.setItem(
      pendingProductCreationStorageKey(creatorId, liveId),
      JSON.stringify(attempt),
    );
  } catch (error) {
    throw new PendingProductCreationStorageError(
      "Product recovery data could not be saved. The product was not submitted; try again when browser storage is available.",
      { cause: error },
    );
  }
}

export function clearPendingProductCreation(creatorId: string, liveId: string) {
  try {
    globalThis.sessionStorage.removeItem(pendingProductCreationStorageKey(creatorId, liveId));
  } catch (error) {
    throw new PendingProductCreationStorageError(
      "The saved product recovery data could not be cleared.",
      { cause: error },
    );
  }
}

function isPendingProductCreation(value: unknown): value is PendingProductCreation {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (typeof record.idempotencyKey !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.idempotencyKey)) {
    return false;
  }

  const input = record.input;
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false;
  const product = input as Record<string, unknown>;
  if (
    typeof product.name !== "string" ||
    product.name.trim().length < 1 ||
    product.name.length > 100 ||
    !Number.isSafeInteger(product.price) ||
    typeof product.price !== "number" ||
    product.price < 1 ||
    product.price > 2_147_483_647 ||
    !Number.isSafeInteger(product.stockQuantity) ||
    typeof product.stockQuantity !== "number" ||
    product.stockQuantity < 0 ||
    product.stockQuantity > 2_147_483_647
  ) {
    return false;
  }

  if (product.options === undefined) return true;
  if (typeof product.options !== "object" || product.options === null || Array.isArray(product.options)) {
    return false;
  }

  return Object.entries(product.options).every(([groupName, choices]) =>
    groupName.trim().length > 0 &&
    Array.isArray(choices) &&
    choices.length > 0 &&
    choices.every((choice) => typeof choice === "string" && choice.trim().length > 0)
  );
}
