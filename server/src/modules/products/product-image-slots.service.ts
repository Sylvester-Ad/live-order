import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  ImageStorageProvider,
  ProductImageUploadRequest,
} from "../../../../generated/prisma/client.js";

const maximumImageSlots = 3;
const maximumBusyRetries = 1;

export type ReserveProductImageSlotInput = {
  idempotencyKey: string;
  creatorId: string;
  liveId: string;
  productId: string;
  fileFingerprint: string;
  provider: ImageStorageProvider;
};

export type ProductImageSlotReservation =
  | { kind: "reserved"; request: ProductImageUploadRequest }
  | { kind: "existing"; request: ProductImageUploadRequest };

function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  const seen = new Set<object>();
  const pending: unknown[] = [error];

  while (pending.length > 0) {
    const current = pending.pop();
    if (typeof current !== "object" || current === null || seen.has(current)) continue;
    seen.add(current);

    for (const key of ["code", "originalCode"] as const) {
      const value = Reflect.get(current, key);
      if (typeof value === "string") codes.push(value);
    }

    for (const key of ["cause", "meta", "driverAdapterError"] as const) {
      pending.push(Reflect.get(current, key));
    }
  }

  return codes;
}

function isUniqueConstraintError(error: unknown): boolean {
  const codes = errorCodes(error);
  return codes.includes("P2002") || codes.some((code) => code.startsWith("SQLITE_CONSTRAINT_UNIQUE"));
}

function isSqliteBusyError(error: unknown): boolean {
  const codes = errorCodes(error);
  return codes.some((code) => code.startsWith("SQLITE_BUSY"));
}

async function withSqliteBusyRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusyError(error) || attempt === maximumBusyRetries) throw error;
      await delay(10 * (attempt + 1));
    }
  }
}

function assertSameRequest(
  existing: ProductImageUploadRequest,
  input: ReserveProductImageSlotInput,
): ProductImageSlotReservation {
  if (
    existing.creatorId !== input.creatorId ||
    existing.liveId !== input.liveId ||
    existing.productId !== input.productId ||
    existing.fileFingerprint !== input.fileFingerprint
  ) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different image upload",
    );
  }

  return { kind: "existing", request: existing };
}

async function findExistingRequest(input: ReserveProductImageSlotInput) {
  const existing = await prisma.productImageUploadRequest.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  return existing ? assertSameRequest(existing, input) : null;
}

async function reserveInTransaction(input: ReserveProductImageSlotInput) {
  return prisma.$transaction(async (tx) => {
    const changed = await tx.product.updateMany({
      where: {
        id: input.productId,
        liveId: input.liveId,
        live: { creatorId: input.creatorId },
        isDeleting: false,
        imageSlotsUsed: { lt: maximumImageSlots },
      },
      data: { imageSlotsUsed: { increment: 1 } },
    });

    if (changed.count === 0) {
      const existing = await tx.productImageUploadRequest.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) return assertSameRequest(existing, input);

      const product = await tx.product.findFirst({
        where: {
          id: input.productId,
          liveId: input.liveId,
          live: { creatorId: input.creatorId },
        },
        select: { imageSlotsUsed: true, isDeleting: true },
      });

      if (!product) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
      }
      if (product.isDeleting) {
        throw new AppError(409, "PRODUCT_DELETING", "This product is being deleted");
      }
      throw new AppError(
        409,
        "PRODUCT_IMAGE_LIMIT_REACHED",
        "A product can have at most three images",
      );
    }

    const id = randomUUID();
    const request = await tx.productImageUploadRequest.create({
      data: {
        id,
        ...input,
        storageId: `liveorder/product-image-uploads/${id}`,
      },
    });

    return { kind: "reserved" as const, request };
  });
}

export async function reserveProductImageSlot(
  input: ReserveProductImageSlotInput,
): Promise<ProductImageSlotReservation> {
  const existing = await withSqliteBusyRetry(() => findExistingRequest(input));
  if (existing) return existing;

  try {
    return await withSqliteBusyRetry(() => reserveInTransaction(input));
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const winner = await withSqliteBusyRetry(() => findExistingRequest(input));
      if (winner) return winner;
    }

    throw error;
  }
}

export async function releaseProductImageSlot(imageId: string): Promise<boolean> {
  return withSqliteBusyRetry(() => prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findUnique({
      where: { id: imageId },
      select: {
        id: true,
        productId: true,
        state: true,
        isPrimary: true,
        uploadRequestId: true,
      },
    });

    if (!image || image.state !== "ACTIVE") return false;

    if (image.uploadRequestId) {
      const request = await tx.productImageUploadRequest.findUnique({
        where: { id: image.uploadRequestId },
        select: { id: true, status: true },
      });

      if (!request || request.status !== "COMPLETED") {
        throw new AppError(
          409,
          "PRODUCT_IMAGE_STATE_INCONSISTENT",
          "The product image and upload request are in an inconsistent state",
        );
      }
    }

    const marked = await tx.productImage.updateMany({
      where: { id: image.id, state: "ACTIVE" },
      data: { state: "DELETING", isPrimary: false },
    });
    if (marked.count === 0) return false;

    if (image.uploadRequestId) {
      const requestTransition = await tx.productImageUploadRequest.updateMany({
        where: { id: image.uploadRequestId, status: "COMPLETED" },
        data: { status: "DELETED" },
      });
      if (requestTransition.count !== 1) {
        throw new AppError(
          409,
          "PRODUCT_IMAGE_STATE_INCONSISTENT",
          "The product image and upload request are in an inconsistent state",
        );
      }
    }

    const released = await tx.product.updateMany({
      where: { id: image.productId, imageSlotsUsed: { gt: 0 } },
      data: { imageSlotsUsed: { decrement: 1 } },
    });
    if (released.count === 0) {
      throw new Error(`Product image slot counter is inconsistent for product ${image.productId}`);
    }

    if (image.isPrimary) {
      const replacement = await tx.productImage.findFirst({
        where: { productId: image.productId, state: "ACTIVE" },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { id: true },
      });

      if (replacement) {
        const promoted = await tx.productImage.updateMany({
          where: {
            id: replacement.id,
            productId: image.productId,
            state: "ACTIVE",
            isPrimary: false,
          },
          data: { isPrimary: true },
        });
        if (promoted.count !== 1) {
          throw new AppError(
            409,
            "PRODUCT_IMAGE_STATE_INCONSISTENT",
            "The product image primary state changed unexpectedly",
          );
        }
      }
    }

    return true;
  }));
}
