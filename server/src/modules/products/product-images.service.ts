import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { Prisma } from "../../../../generated/prisma/client.js";
import { getImageStorage } from "./image-storage/index.js";
import type { ImageStorage, SupportedImageMimeType } from "./image-storage/image-storage.js";
import { releaseProductImageSlot } from "./product-image-slots.service.js";

export const activeProductImagesInclude = {
  images: {
    where: { state: "ACTIVE" },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ProductInclude;

type ProductImageRecord = {
  id: string;
  url: string;
  storageId: string;
  provider: string;
  isPrimary: boolean;
  state: string;
  createdAt: Date;
};

export function serializeProductImages(images: ProductImageRecord[]) {
  const activeImages = images
    .filter((image) => image.state === "ACTIVE")
    .sort((left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary) ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      left.id.localeCompare(right.id),
    )
    .map((image) => ({
      id: image.id,
      url: getImageStorage(image.provider).deliveryUrl(image.storageId, image.url),
      createdAt: image.createdAt,
      isPrimary: image.isPrimary,
    }));
  const primaryImage = activeImages.find((image) => image.isPrimary);

  return {
    images: activeImages,
    image: primaryImage
      ? { id: primaryImage.id, url: primaryImage.url, createdAt: primaryImage.createdAt }
      : null,
  };
}

function logImageCleanupFailure(operation: string, provider: string, storageId: string) {
  console.error("Product image cleanup failed", { operation, provider, storageId });
}

export function productWithImages<T extends { images: ProductImageRecord[] }>(product: T) {
  const { images, ...fields } = product;
  return {
    ...fields,
    ...serializeProductImages(images),
  };
}

export async function getProductWithPrimaryImage(productId: string) {
  const product = await prisma.product.findUniqueOrThrow({
    where: { id: productId },
    include: activeProductImagesInclude,
  });
  return productWithImages(product);
}

export function identifyImageFormat(buffer: Buffer, declaredMimeType: string): SupportedImageMimeType {
  const mimeType =
    buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "image/png"
      : buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
        ? "image/jpeg"
        : buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP"
          ? "image/webp"
          : null;

  if (!mimeType || mimeType !== declaredMimeType) {
    throw new AppError(400, "INVALID_IMAGE_FORMAT", "Upload a valid JPEG, PNG, or WebP image");
  }

  return mimeType;
}

async function ownedProduct(creatorId: string, liveId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, liveId, live: { creatorId } },
    include: activeProductImagesInclude,
  });

  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  return product;
}

export async function selectPrimaryProductImage(
  creatorId: string,
  liveId: string,
  productId: string,
  imageId: string,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({
      where: { id: productId, liveId, live: { creatorId } },
      select: { id: true, isDeleting: true },
    });

    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    if (product.isDeleting) {
      throw new AppError(409, "PRODUCT_DELETING", "This product is being deleted");
    }

    const selectedImage = await tx.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true, state: true },
    });
    if (!selectedImage) {
      throw new AppError(404, "PRODUCT_IMAGE_NOT_FOUND", "Product image not found");
    }
    if (selectedImage.state !== "ACTIVE") {
      throw new AppError(409, "PRODUCT_IMAGE_NOT_ACTIVE", "Only active product images can be selected");
    }

    await tx.productImage.updateMany({
      where: { productId, state: "ACTIVE", isPrimary: true },
      data: { isPrimary: false },
    });

    const selected = await tx.productImage.updateMany({
      where: { id: selectedImage.id, productId, state: "ACTIVE" },
      data: { isPrimary: true },
    });
    if (selected.count !== 1) {
      throw new AppError(409, "PRODUCT_IMAGE_NOT_ACTIVE", "Only active product images can be selected");
    }

    const updatedProduct = await tx.product.findUniqueOrThrow({
      where: { id: product.id },
      include: activeProductImagesInclude,
    });
    return productWithImages(updatedProduct);
  });
}

export async function removeProductImage(
  creatorId: string,
  liveId: string,
  productId: string,
  storage?: ImageStorage,
) {
  const product = await ownedProduct(creatorId, liveId, productId);
  const image = product.images.find((candidate) => candidate.isPrimary);

  if (!image) return productWithImages(product);

  return removeProductImageById(creatorId, liveId, productId, image.id, storage);
}

export async function removeProductImageById(
  creatorId: string,
  liveId: string,
  productId: string,
  imageId: string,
  storage?: ImageStorage,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, liveId, live: { creatorId } },
    select: { id: true },
  });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const image = await prisma.productImage.findFirst({
    where: { id: imageId, productId },
    select: {
      id: true,
      url: true,
      storageId: true,
      provider: true,
      state: true,
    },
  });
  if (!image) throw new AppError(404, "PRODUCT_IMAGE_NOT_FOUND", "Product image not found");

  if (image.state === "ACTIVE") {
    await releaseProductImageSlot(image.id);
  }

  const deletingImage = await prisma.productImage.findFirst({
    where: { id: image.id, productId, state: "DELETING" },
    select: { id: true, storageId: true, provider: true },
  });

  if (deletingImage) {
    try {
      const deliveryUrl = (storage ?? getImageStorage(deletingImage.provider))
        .deliveryUrl(deletingImage.storageId, image.url);
      const historicalOrderReference = await prisma.orderItem.findFirst({
        where: { productImageUrl: deliveryUrl },
        select: { id: true },
      });
      if (!historicalOrderReference) {
        await (storage ?? getImageStorage(deletingImage.provider)).delete(deletingImage.storageId);
      }
      await prisma.productImage.deleteMany({
        where: { id: deletingImage.id, productId, state: "DELETING" },
      });
    } catch {
      logImageCleanupFailure("remove_product_image", deletingImage.provider, deletingImage.storageId);
    }
  }

  return prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    include: activeProductImagesInclude,
  }).then(productWithImages);
}

export const productImageValidation = {
  identifyImageFormat,
  maxBytes: 5 * 1024 * 1024,
};
