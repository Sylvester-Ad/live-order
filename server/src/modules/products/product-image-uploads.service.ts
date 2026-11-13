import { createHash, randomUUID } from "node:crypto";

import { prisma } from "../../database/prisma.js";
import { AppError } from "../../shared/errors/app-error.js";
import type { ProductImageUploadRequest } from "../../../../generated/prisma/client.js";
import { getImageStorage } from "./image-storage/index.js";
import type { ImageStorage, SupportedImageMimeType } from "./image-storage/image-storage.js";
import {
  getProductWithPrimaryImage,
  identifyImageFormat,
  productImageValidation,
} from "./product-images.service.js";
import {
  reserveProductImageSlot,
  type ReserveProductImageSlotInput,
} from "./product-image-slots.service.js";
import { productImageUploadIdempotencyKeySchema } from "./products.schemas.js";

type ImageFile = { buffer: Buffer; mimetype: string };

function createFileFingerprint(
  creatorId: string,
  liveId: string,
  productId: string,
  mimeType: SupportedImageMimeType,
  buffer: Buffer,
) {
  const fileDigest = createHash("sha256").update(buffer).digest("hex");
  return createHash("sha256")
    .update(JSON.stringify([creatorId, liveId, productId, mimeType, fileDigest]))
    .digest("hex");
}

function imageResult(image: {
  id: string;
  url: string;
  storageId: string;
  provider: string;
  createdAt: Date;
}) {
  return {
    id: image.id,
    url: getImageStorage(image.provider).deliveryUrl(image.storageId, image.url),
    createdAt: image.createdAt,
  };
}

function deletedUploadError() {
  return new AppError(
    410,
    "IDEMPOTENCY_RESULT_DELETED",
    "The image created by this request has since been deleted",
  );
}

async function findUploadRequest(
  idempotencyKey: string,
  creatorId: string,
  liveId: string,
) {
  return prisma.productImageUploadRequest.findFirst({
    where: { idempotencyKey, creatorId, liveId },
    include: { productImage: true },
  });
}

async function getCompletedImage(requestId: string) {
  const request = await prisma.productImageUploadRequest.findUnique({
    where: { id: requestId },
    include: { productImage: true },
  });

  if (!request || request.status === "DELETED") throw deletedUploadError();
  if (request.status !== "COMPLETED" || !request.productImage) {
    throw new AppError(409, "IMAGE_UPLOAD_PENDING", "The image upload is still pending");
  }
  if (request.productImage.state !== "ACTIVE") throw deletedUploadError();

  return imageResult(request.productImage);
}

async function finalizeProductImageUpload(
  request: ProductImageUploadRequest,
  stored: { url: string; storageId: string; provider: "CLOUDINARY" },
) {
  return prisma.$transaction(async (tx) => {
    const transitioned = await tx.productImageUploadRequest.updateMany({
      where: {
        id: request.id,
        idempotencyKey: request.idempotencyKey,
        creatorId: request.creatorId,
        liveId: request.liveId,
        productId: request.productId,
        fileFingerprint: request.fileFingerprint,
        provider: request.provider,
        storageId: request.storageId,
        status: "PENDING",
      },
      data: { status: "COMPLETED" },
    });

    if (transitioned.count === 0) {
      const existing = await tx.productImageUploadRequest.findUnique({
        where: { id: request.id },
        include: { productImage: true },
      });

      if (!existing) throw new AppError(404, "IMAGE_UPLOAD_NOT_FOUND", "Image upload not found");
      if (existing.status === "DELETED") throw deletedUploadError();
      if (
        existing.creatorId !== request.creatorId ||
        existing.liveId !== request.liveId ||
        existing.productId !== request.productId ||
        existing.fileFingerprint !== request.fileFingerprint
      ) {
        throw new AppError(
          409,
          "IDEMPOTENCY_KEY_REUSED",
          "This idempotency key was already used for a different image upload",
        );
      }
      if (existing.status !== "COMPLETED" || !existing.productImage) {
        throw new AppError(409, "IMAGE_UPLOAD_PENDING", "The image upload is still pending");
      }
      if (existing.productImage.state !== "ACTIVE") throw deletedUploadError();

      return imageResult(existing.productImage);
    }

    const product = await tx.product.findFirst({
      where: {
        id: request.productId,
        liveId: request.liveId,
        isDeleting: false,
        live: { creatorId: request.creatorId },
      },
      select: {
        id: true,
        images: {
          where: { state: "ACTIVE", isPrimary: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!product) {
      const exists = await tx.product.findFirst({
        where: {
          id: request.productId,
          liveId: request.liveId,
          live: { creatorId: request.creatorId },
        },
        select: { id: true },
      });
      if (exists) throw new AppError(409, "PRODUCT_DELETING", "This product is being deleted");
      throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
    }

    const image = await tx.productImage.create({
      data: {
        id: randomUUID(),
        productId: product.id,
        url: stored.url,
        storageId: stored.storageId,
        provider: stored.provider,
        isPrimary: product.images.length === 0,
        state: "ACTIVE",
        uploadRequestId: request.id,
      },
    });

    return imageResult(image);
  });
}

export async function uploadProductImage(
  creatorId: string,
  liveId: string,
  productId: string,
  rawIdempotencyKey: string | undefined,
  file: ImageFile,
  storage: ImageStorage = getImageStorage(),
) {
  const idempotencyKey = productImageUploadIdempotencyKeySchema.parse(rawIdempotencyKey);
  if (file.buffer.length === 0) {
    throw new AppError(400, "IMAGE_REQUIRED", "Choose an image to upload");
  }
  if (file.buffer.length > productImageValidation.maxBytes) {
    throw new AppError(413, "IMAGE_TOO_LARGE", "Product images must be 5 MB or smaller");
  }

  const mimeType = identifyImageFormat(file.buffer, file.mimetype);
  const fileFingerprint = createFileFingerprint(creatorId, liveId, productId, mimeType, file.buffer);
  const input: ReserveProductImageSlotInput = {
    idempotencyKey,
    creatorId,
    liveId,
    productId,
    fileFingerprint,
    provider: "CLOUDINARY",
  };

  const live = await prisma.live.findFirst({
    where: { id: liveId, creatorId },
    select: { id: true },
  });
  if (!live) throw new AppError(404, "LIVE_NOT_FOUND", "Live not found");

  const existing = await findUploadRequest(idempotencyKey, creatorId, liveId);
  if (!existing) {
    const product = await prisma.product.findFirst({
      where: { id: productId, liveId, live: { creatorId } },
      select: { id: true },
    });
    if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");
  }

  const reservation = await reserveProductImageSlot(input);
  if (reservation.request.status === "DELETED") throw deletedUploadError();
  if (reservation.request.status === "COMPLETED") {
    const image = await getCompletedImage(reservation.request.id);
    return {
      product: await getProductWithPrimaryImage(productId),
      image,
      statusCode: 200,
    };
  }

  let stored: Awaited<ReturnType<ImageStorage["upload"]>>;
  try {
    stored = await storage.upload({
      buffer: file.buffer,
      mimeType,
      storageId: reservation.request.storageId,
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "IMAGE_STORAGE_FAILED", "The product image could not be uploaded");
  }

  if (stored.provider !== reservation.request.provider || stored.storageId !== reservation.request.storageId) {
    throw new AppError(
      502,
      "IMAGE_STORAGE_ID_MISMATCH",
      "The image storage provider returned an unexpected upload identity",
    );
  }
  try {
    const url = new URL(stored.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Unsupported image URL protocol");
  } catch {
    throw new AppError(502, "IMAGE_STORAGE_FAILED", "The image storage provider returned an invalid URL");
  }

  let uploadedImage: ReturnType<typeof imageResult>;
  try {
    uploadedImage = await finalizeProductImageUpload(reservation.request, stored);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      503,
      "IMAGE_FINALIZATION_PENDING",
      "The image was uploaded and can be safely finalized by retrying with the same key and file",
    );
  }

  return {
    product: await getProductWithPrimaryImage(productId),
    image: uploadedImage,
    statusCode: reservation.kind === "reserved" ? 201 : 200,
  };
}

export async function getProductImageUploadStatus(
  creatorId: string,
  liveId: string,
  rawIdempotencyKey: string,
) {
  const idempotencyKey = productImageUploadIdempotencyKeySchema.parse(rawIdempotencyKey);
  const live = await prisma.live.findFirst({ where: { id: liveId, creatorId }, select: { id: true } });
  if (!live) throw new AppError(404, "IMAGE_UPLOAD_NOT_FOUND", "Image upload not found");

  const request = await findUploadRequest(idempotencyKey, creatorId, liveId);
  if (!request) throw new AppError(404, "IMAGE_UPLOAD_NOT_FOUND", "Image upload not found");
  if (request.status === "DELETED") throw deletedUploadError();

  if (request.status === "PENDING") {
    return {
      idempotencyKey: request.idempotencyKey,
      productId: request.productId,
      status: request.status,
      canResume: true as const,
      createdAt: request.createdAt,
    };
  }

  if (!request.productImage || request.productImage.state !== "ACTIVE") throw deletedUploadError();

  return {
    idempotencyKey: request.idempotencyKey,
    productId: request.productId,
    status: request.status,
    canResume: false as const,
    image: imageResult(request.productImage),
    createdAt: request.createdAt,
  };
}

export async function listPendingProductImageUploads(
  creatorId: string,
  liveId: string,
  productId: string,
) {
  const product = await prisma.product.findFirst({
    where: { id: productId, liveId, live: { creatorId } },
    select: { id: true },
  });
  if (!product) throw new AppError(404, "PRODUCT_NOT_FOUND", "Product not found");

  const uploads = await prisma.productImageUploadRequest.findMany({
    where: { creatorId, liveId, productId, status: "PENDING" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { idempotencyKey: true, createdAt: true },
  });

  return uploads.map((upload) => ({ ...upload, status: "PENDING" as const, canResume: true as const }));
}
