import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "./products.schemas.js";
import { Prisma } from "../../../../generated/prisma/client.js";

export async function createProduct(
  creatorId: string,
  liveId: string,
  input: CreateProductInput,
) {
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
    throw new AppError(
      404,
      "LIVE_NOT_FOUND",
      "Live not found",
    );
  }

  return prisma.product.create({
    data: {
      liveId,
      name: input.name,
      price: input.price,
      options: input.options as Prisma.InputJsonValue | undefined,
    },
  });
}

export async function listProducts(creatorId: string, liveId: string) {
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

  return prisma.product.findMany({
    where: {
      liveId: live.id,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function updateProduct(
  creatorId: string,
  liveId: string,
  productId: string,
  input: UpdateProductInput,
) {
  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      liveId,
      live: { creatorId },
    },
    select: { id: true },
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  return prisma.product.update({
    where: { id: product.id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.options !== undefined && {
        options:
          input.options === null
            ? Prisma.DbNull
            : (input.options as Prisma.InputJsonValue),
      }),
    },
  });
}

function isForeignKeyConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2003"
  );
}

export async function deleteProduct(
  creatorId: string,
  liveId: string,
  productId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: {
        id: productId,
        liveId,
        live: { creatorId },
      },
      select: { id: true },
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const orderItemCount = await tx.orderItem.count({
      where: { productId: product.id },
    });

    if (orderItemCount > 0) {
      throw new AppError(
        409,
        "PRODUCT_IN_USE",
        "Products with order history cannot be deleted",
      );
    }

    try {
      await tx.product.delete({ where: { id: product.id } });
    } catch (error) {
      if (isForeignKeyConstraintError(error)) {
        throw new AppError(
          409,
          "PRODUCT_IN_USE",
          "Products with order history cannot be deleted",
        );
      }

      throw error;
    }
  });
}
