import { createHash } from "node:crypto";

import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { createWithOrderReference } from "./order-reference.js";
import type { CreateOrderInput } from "./orders.schemas.js";
import { getImageStorage } from "../products/image-storage/index.js";
import { createPaginationMetadata, type PaginationInput } from "../../shared/utils/pagination.js";

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

function fingerprintRequest(storeId: string, input: CreateOrderInput): string {
  const normalized = {
    liveId: storeId,
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
  storeId: string,
  input: CreateOrderInput,
  idempotencyKey?: string,
) {
  const requestFingerprint = idempotencyKey ? fingerprintRequest(storeId, input) : undefined;

  if (idempotencyKey && requestFingerprint) {
    const previousOrder = await findIdempotentOrder(idempotencyKey, requestFingerprint);
    if (previousOrder) return previousOrder;
  }

  const storeState = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, status: true },
  });

  if (!storeState) throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  if (storeState.status !== "PUBLISHED") {
    throw new AppError(409, "LIVE_NOT_ACTIVE", "This Live is not accepting orders");
  }

  try {
    return await createWithOrderReference((reference) => prisma.$transaction(async (tx) => {
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
          where: { id: productId, storeId, isDeleting: false, stockQuantity: { gte: quantity } },
          data: { stockQuantity: { decrement: quantity } },
        });

        if (changed.count === 0) {
          const product = await tx.product.findFirst({
            where: { id: productId, storeId },
            select: { id: true, isDeleting: true },
          });
          if (!product) {
            throw new AppError(400, "INVALID_PRODUCT", "One or more products do not belong to this Live");
          }
          if (product.isDeleting) {
            throw new AppError(409, "PRODUCT_DELETING", "One or more products are being deleted");
          }
          throw new AppError(409, "INSUFFICIENT_STOCK", "One or more products no longer have enough stock");
        }
      }

      const store = await tx.store.findUnique({
        where: { id: storeId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!store) {
        throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
      }

      // Recheck in the transaction in case the Store was unpublished after preflight.
      if (store.status !== "PUBLISHED") {
        throw new AppError(409, "LIVE_NOT_ACTIVE", "This Live is not accepting orders");
      }

      const mobileMoneySettings = await tx.storeMobileMoneySettings.findUnique({
        where: { storeId: store.id },
        select: {
          provider: true,
          mobileMoneyNumber: true,
          accountName: true,
          enabled: true,
        },
      });

      const products = await tx.product.findMany({
        where: { id: { in: [...requestedQuantities.keys()] }, storeId: store.id },
        select: {
          id: true,
          name: true,
          price: true,
          options: true,
          images: {
            where: { state: "ACTIVE", isPrimary: true },
            take: 1,
            select: { url: true, storageId: true, provider: true },
          },
        },
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
          productImageUrl: product.images[0]
            ? getImageStorage(product.images[0].provider).deliveryUrl(
                product.images[0].storageId,
                product.images[0].url,
              )
            : null,
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
          storeId: store.id,
          reference,
          ...(idempotencyKey && requestFingerprint && {
            idempotencyKey,
            requestFingerprint,
          }),
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          deliveryLocation: input.deliveryLocation,
          totalAmount,
          ...(mobileMoneySettings?.enabled
            ? {
                mobileMoneyProvider: mobileMoneySettings.provider,
                mobileMoneyNumber: mobileMoneySettings.mobileMoneyNumber,
                mobileMoneyAccountName: mobileMoneySettings.accountName,
              }
            : {}),
          items: {
            create: items,
          },
        },
        include: {
          items: true,
        },
      });
    }));
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
  const selectionEntries = Object.entries(selection ?? {});
  const optionsObject = typeof options === "object" && options !== null && !Array.isArray(options)
    ? options as Record<string, unknown>
    : null;

  // Options in the currently supported representation are required customer
  // preferences. Leave unknown legacy formats untouched for compatibility.
  const optionsAreSupported = optionsObject !== null && Object.values(optionsObject).every(
    (choices) => Array.isArray(choices) && choices.every((choice) => typeof choice === "string"),
  );
  if (optionsAreSupported && Object.keys(optionsObject).some(
    (group) => typeof selection?.[group] !== "string" || !selection[group],
  )) {
    throw new AppError(400, "INVALID_PRODUCT_OPTIONS", "The selected options are not available for this product");
  }

  if (selectionEntries.length === 0) return;
  if (!optionsObject) {
    throw new AppError(400, "INVALID_PRODUCT_OPTIONS", "The selected options are not available for this product");
  }

  for (const [group, choice] of selectionEntries) {
    const choices = optionsObject[group];
    if (typeof choice !== "string" || !Array.isArray(choices) || !choices.includes(choice)) {
      throw new AppError(400, "INVALID_PRODUCT_OPTIONS", "The selected options are not available for this product");
    }
  }
}

export async function listOrders(creatorId: string, storeId: string, pagination?: PaginationInput) {
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      creatorId,
    },
    select: {
      id: true,
    },
  });

  if (!store) {
    throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  }

  const where = { storeId: store.id };
  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  if (!pagination) {
    return prisma.order.findMany({ where, orderBy, include: { items: true } });
  }

  const [total, data] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy,
      skip: (pagination.page - 1) * pagination.limit,
      take: pagination.limit,
      include: { items: true },
    }),
  ]);
  return { data, pagination: createPaginationMetadata(pagination.page, pagination.limit, total) };
}

export async function getOrder(creatorId: string, storeId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      storeId,
      store: { creatorId },
    },
    include: { items: true },
  });

  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Order not found");
  return order;
}

export async function markOrderAsPaid(
  creatorId: string,
  orderId: string,
  storeId?: string,
) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      ...(storeId !== undefined && { storeId }),
      store: {
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

export async function exportOrders(creatorId: string, storeId: string) {
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      creatorId,
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!store) {
    throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
  }

  const orders = await prisma.order.findMany({
    where: {
      storeId: store.id,
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      items: true,
    },
  });

  return {
    live: store,
    orders,
  };
}
