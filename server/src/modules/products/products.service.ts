import { createHash } from "node:crypto";

import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "./products.schemas.js";
import { Prisma } from "../../../../generated/prisma/client.js";
import { getImageStorage } from "./image-storage/index.js";
import {
  activeProductImagesInclude,
  productWithImages,
} from "./product-images.service.js";

export async function createProduct(
  creatorId: string,
  liveId: string,
  input: CreateProductInput,
  idempotencyKey: string,
) {
  const normalizedInput = {
    name: input.name.trim(),
    price: input.price,
    stockQuantity: input.stockQuantity ?? 0,
    options: input.options ?? null,
  };
  const requestFingerprint = createHash("sha256")
    .update(stableJson({ creatorId, liveId, ...normalizedInput }))
    .digest("hex");

  const existingProduct = await findIdempotentProduct(
    idempotencyKey,
    creatorId,
    liveId,
    requestFingerprint,
  );
  if (existingProduct) return existingProduct;

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

  try {
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          liveId,
          name: normalizedInput.name,
          price: input.price,
          stockQuantity: normalizedInput.stockQuantity,
          ...(normalizedInput.options !== null && {
            options: normalizedInput.options as Prisma.InputJsonValue,
          }),
        },
      });

      await tx.productCreationRequest.create({
        data: {
          idempotencyKey,
          creatorId,
          liveId,
          requestFingerprint,
          productId: created.id,
        },
      });

      return tx.product.findUniqueOrThrow({
        where: { id: created.id },
        include: activeProductImagesInclude,
      });
    });

    return productWithImages(product);
  } catch (error) {
    try {
      const committedProduct = await findIdempotentProduct(
        idempotencyKey,
        creatorId,
        liveId,
        requestFingerprint,
      );
      if (committedProduct) return committedProduct;
    } catch (lookupError) {
      if (
        lookupError instanceof AppError &&
        ["IDEMPOTENCY_KEY_REUSED", "IDEMPOTENCY_RESULT_DELETED"].includes(lookupError.code)
      ) {
        throw lookupError;
      }
    }

    throw error;
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new TypeError("Product request contains a non-JSON value");
  return serialized;
}

async function findIdempotentProduct(
  idempotencyKey: string,
  creatorId: string,
  liveId: string,
  requestFingerprint: string,
) {
  const creationRequest = await prisma.productCreationRequest.findUnique({
    where: { idempotencyKey },
    include: {
      product: { include: activeProductImagesInclude },
    },
  });

  if (!creationRequest) return null;
  if (
    creationRequest.creatorId !== creatorId ||
    creationRequest.liveId !== liveId ||
    creationRequest.requestFingerprint !== requestFingerprint
  ) {
    throw new AppError(
      409,
      "IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different product request",
    );
  }
  if (!creationRequest.product) {
    throw new AppError(
      410,
      "IDEMPOTENCY_RESULT_DELETED",
      "The product created by this request has since been deleted",
    );
  }

  return productWithImages(creationRequest.product);
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
    include: activeProductImagesInclude,
  }).then((products) => products.map(productWithImages));
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
      ...(input.stockQuantity !== undefined && { stockQuantity: input.stockQuantity }),
      ...(input.options !== undefined && {
        options:
          input.options === null
            ? Prisma.DbNull
            : (input.options as Prisma.InputJsonValue),
      }),
    },
    include: activeProductImagesInclude,
  }).then(productWithImages);
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
  const images = await prisma.$transaction(async (tx) => {
    const deletionGate = await tx.product.updateMany({
      where: {
        id: productId,
        liveId,
        isDeleting: false,
        live: { creatorId },
      },
      data: { isDeleting: true },
    });

    if (deletionGate.count === 0) {
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

      throw new AppError(409, "PRODUCT_DELETING", "This product is already being deleted");
    }

    const product = await tx.product.findFirst({
      where: {
        id: productId,
        liveId,
        live: { creatorId },
      },
      select: { id: true, images: { select: { storageId: true, provider: true } } },
    });

    if (!product) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const pendingImageUploads = await tx.productImageUploadRequest.count({
      where: { productId: product.id, status: "PENDING" },
    });

    if (pendingImageUploads > 0) {
      throw new AppError(
        409,
        "PENDING_IMAGE_UPLOADS",
        "Resolve pending image uploads before deleting this product",
      );
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

    await tx.productImageUploadRequest.updateMany({
      where: { productId: product.id, status: "COMPLETED" },
      data: { status: "DELETED" },
    });

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

    return product.images;
  });

  await Promise.allSettled(images.map(async (image) => {
    try {
      await getImageStorage(image.provider).delete(image.storageId);
    } catch {
      // ProductImage rows cascade with the product, so logs preserve the recovery identifier.
      console.error("Product image cleanup failed", {
        operation: "delete_product_image",
        provider: image.provider,
        storageId: image.storageId,
      });
    }
  }));
}
