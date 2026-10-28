import { randomBytes } from "node:crypto";

import { AppError } from "../../shared/errors/app-error.js";

const maxReferenceAttempts = 5;

export function generateOrderReference(): string {
  return `ORD-${randomBytes(8).toString("hex").toUpperCase()}`;
}

function isReferenceCollision(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") {
    return false;
  }

  if (!("meta" in error) || typeof error.meta !== "object" || error.meta === null || !("target" in error.meta)) {
    return false;
  }

  return JSON.stringify(error.meta.target).toLowerCase().includes("reference");
}

export async function createWithOrderReference<T>(
  create: (reference: string) => Promise<T>,
  generate: () => string = generateOrderReference,
): Promise<T> {
  for (let attempt = 0; attempt < maxReferenceAttempts; attempt += 1) {
    try {
      return await create(generate());
    } catch (error) {
      if (!isReferenceCollision(error)) throw error;
      if (attempt === maxReferenceAttempts - 1) {
        throw new AppError(503, "ORDER_REFERENCE_UNAVAILABLE", "Could not create an order reference. Please try again.");
      }
    }
  }

  throw new AppError(503, "ORDER_REFERENCE_UNAVAILABLE", "Could not create an order reference. Please try again.");
}
