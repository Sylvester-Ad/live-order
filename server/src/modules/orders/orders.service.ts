import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreateOrderInput } from "./orders.schemas.js";

export async function createOrder(liveId: string, input: CreateOrderInput) {
  return prisma.$transaction(async (tx) => {
    const live = await tx.live.findUnique({
      where: { id: liveId },
      select: {
        id: true,
        status: true,
        products: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
    });

    if (!live) {
      throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");
    }

    if (live.status !== "ACTIVE") {
      throw new AppError(
        409,
        "LIVE_NOT_ACTIVE",
        "This Live is not accepting orders",
      );
    }

    const productById = new Map(
      live.products.map((product) => [product.id, product]),
    );

    const items = input.items.map((item) => {
      const product = productById.get(item.productId);

      if (!product) {
        throw new AppError(
          400,
          "INVALID_PRODUCT",
          "One or more products do not belong to this Live",
        );
      }

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

    if (!Number.isSafeInteger(totalAmount)) {
      throw new AppError(
        400,
        "ORDER_TOTAL_TOO_LARGE",
        "The calculated order total is too large",
      );
    }

    return tx.order.create({
      data: {
        liveId: live.id,
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
