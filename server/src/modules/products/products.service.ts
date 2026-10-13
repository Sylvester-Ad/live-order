import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { CreateProductInput } from "./products.schemas.js";
import type { Prisma } from "../../../../generated/prisma/client.js";

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