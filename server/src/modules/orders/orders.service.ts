import { createHash } from "node:crypto";

import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreateOrderInput } from "./orders.schemas.js";

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Order request contains a non-JSON value");
  return serialized;
}

function fingerprintRequest(liveId: string, input: CreateOrderInput): string {
  const normalized = {
    liveId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    deliveryLocation: input.deliveryLocation,
    // Item ordering is retained; object property ordering is canonicalized.
    items: input.items.map(({ productId, quantity, selectedOptions }) => ({
      productId,
      quantity,
      ...(selectedOptions && Object.keys(selectedOptions).length > 0 && { selectedOptions }),
    })),
  };

  return createHash("sha256").update(stableJson(normalized)).digest("hex");
}

async function findIdempotentOrder(idempotencyKey: string, requestFingerprint: string) {
  const order = await prisma.order.findUnique({
    where: { idempotencyKey },
    include: { items: true },
  });

  if (!order) return null;
  if (order.requestFingerprint !== requestFingerprint) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different order request",
    );
  }

  return order;
}

export async function createOrder(
  liveId: string,
  input: CreateOrderInput,
  idempotencyKey?: string,
) {
  const requestFingerprint = idempotencyKey ? fingerprintRequest(liveId, input) : undefined;

  if (idempotencyKey && requestFingerprint) {
    const previousOrder = await findIdempotentOrder(idempotencyKey, requestFingerprint);
    if (previousOrder) return previousOrder;
  }

  const liveState = await prisma.live.findUnique({
    where: { id: liveId },
    select: { id: true, status: true },
  });

  if (!liveState) throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  if (liveState.status !== "ACTIVE") {
    throw new AppError(409, "LIVE_NOT_ACTIVE", "This Live is not accepting orders");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const requestedQuantities = new Map<string, number>();
      for (const item of input.items) {
        requestedQuantities.set(
          item.productId,
          (requestedQuantities.get(item.productId) ?? 0) + item.quantity,
        );
      }

      // Conditional updates acquire SQLite's write lock before reading stock. The
      // database predicate is the concurrency guard; a stale read cannot oversell.
      for (const [productId, quantity] of requestedQuantities) {
        const changed = await tx.product.updateMany({
          where: { id: productId, liveId, stockQuantity: { gte: quantity } },
          data: { stockQuantity: { decrement: quantity } },
        });

        if (changed.count === 0) {
          const product = await tx.product.findFirst({
            where: { id: productId, liveId },
            select: { id: true },
          });
          if (!product) {
            throw new AppError(400, "INVALID_PRODUCT", "One or more products do not belong to this Live");
          }
          throw new AppError(409, "INSUFFICIENT_STOCK", "One or more products no longer have enough stock");
        }
      }

      const live = await tx.live.findUnique({
        where: { id: liveId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!live) {
        throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
      }

      // Recheck in the transaction in case the Live ended after preflight.
      if (live.status !== "ACTIVE") {
        throw new AppError(409, "LIVE_NOT_ACTIVE", "This Live is not accepting orders");
      }

      const products = await tx.product.findMany({
        where: { id: { in: [...requestedQuantities.keys()] }, liveId: live.id },
        select: { id: true, name: true, price: true, options: true },
      });
      const productById = new Map(products.map((product) => [product.id, product]));

      const items = input.items.map((item) => {
        const product = productById.get(item.productId);

        if (!product) {
          throw new AppError(
            400,
            "INVALID_PRODUCT",
            "One or more products do not belong to this Live",
          );
        }

        validateOptionSelection(product.options, item.selectedOptions);

        return {
          product: {
            connect: { id: product.id },
          },
          productName: product.name,
          unitPrice: product.price,
          quantity: item.quantity,
          ...(item.selectedOptions !== undefined && {
            selectedOptions:
              item.selectedOptions as import("../../../../generated/prisma/client.js").Prisma.InputJsonValue,
          }),
        };
      });

      const totalAmount = items.reduce(
        (total, item) => total + item.unitPrice * item.quantity,
        0,
      );

      if (!Number.isSafeInteger(totalAmount) || totalAmount > 2_147_483_647) {
        throw new AppError(
          400,
          "ORDER_TOTAL_TOO_LARGE",
          "The calculated order total is too large",
        );
      }

      return tx.order.create({
        data: {
          liveId: live.id,
          ...(idempotencyKey && requestFingerprint && {
            idempotencyKey,
            requestFingerprint,
          }),
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          deliveryLocation: input.deliveryLocation,
          totalAmount,
          items: {
            create: items,
          },
        },
        include: {
          items: true,
        },
      });
    });
  } catch (error) {
    // A competing request may have committed this key while this transaction
    // was waiting on SQLite's write lock or attempting the unique insert.
    if (idempotencyKey && requestFingerprint) {
      try {
        const committedOrder = await findIdempotentOrder(idempotencyKey, requestFingerprint);
        if (committedOrder) return committedOrder;
      } catch (lookupError) {
        if (lookupError instanceof AppError && lookupError.code === "IDEMPOTENCY_KEY_REUSED") {
          throw lookupError;
        }
        // Preserve the transaction error if the follow-up lookup itself failed.
      }
    }

    throw error;
  }
}

function validateOptionSelection(options: unknown, selection: Record<string, unknown> | undefined) {
  if (!selection || Object.keys(selection).length === 0) return;
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new AppError(400, "INVALID_PRODUCT_OPTIONS", "The selected options are not available for this product");
  }

  for (const [group, choice] of Object.entries(selection)) {
    const choices: unknown = (options as Record<string, unknown>)[group];
    if (typeof choice !== "string" || !Array.isArray(choices) || !choices.includes(choice)) {
      throw new AppError(400, "INVALID_PRODUCT_OPTIONS", "The selected options are not available for this product");
    }
  }
}

export async function listOrders(creatorId: string, liveId: string) {
  const live = await prisma.live.findFirst({
    where: {
      id: liveId,
      creatorId,
    },
    select: {
      id: true,
    },
  });

  if (!live) {
    throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  }

  return prisma.order.findMany({
    where: {
      liveId: live.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      items: true,
    },
  });
}

export async function markOrderAsPaid(
  creatorId: string,
  orderId: string,
) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      live: {
        creatorId,
      },
    },
    select: {
      id: true,
      paymentStatus: true,
    },
  });

  if (!order) {
    throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  }

  if (order.paymentStatus === "PAID") {
    return prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
  }

  return prisma.order.update({
    where: { id: order.id },
    data: {
      paymentStatus: "PAID",
    },
    include: {
      items: true,
    },
  });
}

export async function exportOrders(creatorId: string, liveId: string) {
  const live = await prisma.live.findFirst({
    where: {
      id: liveId,
      creatorId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!live) {
    throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  }

  const orders = await prisma.order.findMany({
    where: {
      liveId: live.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      items: true,
    },
  });

  return {
    live,
    orders,
  };
}
