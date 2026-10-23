import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import { getImageStorage } from "./image-storage/index.js";
import type { ImageStorage, SupportedImageMimeType } from "./image-storage/image-storage.js";

const imageByProduct = {
  images: { where: { isPrimary: true }, take: 1 },
} as const;

function logImageCleanupFailure(operation: string, provider: string, storageId: string) {
  console.error("Product image cleanup failed", { operation, provider, storageId });
}

function productWithImage<T extends { images: Array<{ id: string; url: string; storageId: string; provider: string; createdAt: Date }> }>(product: T) {
  const { images, ...fields } = product;
  const image = images[0];
  return {
    ...fields,
    image: image
      ? {
          id: image.id,
          url: getImageStorage(image.provider).deliveryUrl(image.storageId, image.url),
          createdAt: image.createdAt,
        }
      : null,
  };
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
    include: imageByProduct,
  });

  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  return product;
}

export async function uploadProductImage(
  creatorId: string,
  liveId: string,
  productId: string,
  file: { buffer: Buffer; mimetype: string },
  storage: ImageStorage = getImageStorage(),
) {
  const product = await ownedProduct(creatorId, liveId, productId);
  const mimeType = identifyImageFormat(file.buffer, file.mimetype);
  const stored = await storage.upload({ buffer: file.buffer, mimeType });

  let newImage;
  try {
    newImage = await prisma.$transaction(async (tx) => {
      await tx.productImage.updateMany({
        where: { productId: product.id, isPrimary: true },
        data: { isPrimary: false },
      });

      return tx.productImage.create({
        data: {
          productId: product.id,
          url: stored.url,
          storageId: stored.storageId,
          provider: stored.provider,
          isPrimary: true,
        },
      });
    });
  } catch (error) {
    await storage.delete(stored.storageId).catch(() => {
      logImageCleanupFailure("remove_failed_upload", stored.provider, stored.storageId);
    });
    throw error;
  }

  const previousImages = await prisma.productImage.findMany({
    where: { productId: product.id, isPrimary: false },
    select: { id: true, storageId: true, provider: true },
  });
  await Promise.allSettled(previousImages.map(async (image) => {
    const imageStorage = image.provider === stored.provider ? storage : getImageStorage(image.provider);
    try {
      await imageStorage.delete(image.storageId);
      await prisma.productImage.delete({ where: { id: image.id } });
    } catch {
      // The non-primary row retains the provider and storage ID for later cleanup.
      logImageCleanupFailure("replace_previous_image", image.provider, image.storageId);
    }
  }));

  return prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    include: imageByProduct,
  }).then(productWithImage);
}

export async function removeProductImage(
  creatorId: string,
  liveId: string,
  productId: string,
  storage: ImageStorage = getImageStorage(),
) {
  const product = await ownedProduct(creatorId, liveId, productId);
  const image = product.images[0];

  if (image) {
    await prisma.productImage.update({
      where: { id: image.id },
      data: { isPrimary: false },
    });

    try {
      await storage.delete(image.storageId);
      await prisma.productImage.delete({ where: { id: image.id } });
    } catch {
      // The image is no longer displayed; its row remains available for cleanup.
      logImageCleanupFailure("remove_product_image", image.provider, image.storageId);
    }
  }

  return prisma.product.findUniqueOrThrow({
    where: { id: product.id },
    include: imageByProduct,
  }).then(productWithImage);
}

export const productImageValidation = {
  identifyImageFormat,
  maxBytes: 5 * 1024 * 1024,
};
