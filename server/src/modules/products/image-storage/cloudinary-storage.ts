import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { v2 as cloudinary } from "cloudinary";

import { AppError } from "../../../shared/errors/app-error.js";
import type { ImageStorage, SupportedImageMimeType, StoredProductImage } from "./image-storage.js";

const folder = "liveorder/products";

function configureCloudinary() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
  const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
  const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError(
      503,
      "IMAGE_STORAGE_NOT_CONFIGURED",
      "Product image storage is not configured",
    );
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
}

export const cloudinaryStorage: ImageStorage = {
  async upload({ buffer, mimeType }: { buffer: Buffer; mimeType: SupportedImageMimeType }): Promise<StoredProductImage> {
    configureCloudinary();

    return new Promise<StoredProductImage>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: randomUUID(),
          resource_type: "image",
          overwrite: false,
          allowed_formats: ["jpg", "png", "webp"],
          format: mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp",
        },
        (error, result) => {
          if (error || !result?.secure_url || !result.public_id) {
            reject(error ?? new Error("Cloudinary returned an incomplete upload response"));
            return;
          }

          resolve({ url: result.secure_url, storageId: result.public_id, provider: "CLOUDINARY" });
        },
      );

      Readable.from(buffer).pipe(upload);
    }).catch((error: unknown) => {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "IMAGE_STORAGE_FAILED", "The product image could not be uploaded");
    });
  },

  async delete(storageId: string): Promise<void> {
    configureCloudinary();
    try {
      const result = await cloudinary.uploader.destroy(storageId, { resource_type: "image" });
      if (result.result !== "ok" && result.result !== "not found") {
        throw new Error("Cloudinary did not confirm image deletion");
      }
    } catch {
      throw new AppError(502, "IMAGE_STORAGE_FAILED", "The product image could not be removed");
    }
  },

  deliveryUrl(storageId: string, originalUrl: string): string {
    let source: URL;
    try {
      source = new URL(originalUrl);
    } catch {
      return originalUrl;
    }
    const segments = source.pathname.split("/").filter(Boolean);
    const uploadIndex = segments.findIndex((segment, index) => segment === "image" && segments[index + 1] === "upload");

    if (source.hostname !== "res.cloudinary.com" || uploadIndex !== 1) return originalUrl;

    const cloudName = segments[0];
    const versionSegment = segments.slice(uploadIndex + 2).find((segment) => /^v\d+$/.test(segment));
    if (!cloudName) return originalUrl;

    return cloudinary.url(storageId, {
      cloud_name: cloudName,
      secure: true,
      ...(versionSegment ? { version: Number(versionSegment.slice(1)) } : {}),
      transformation: [
        { width: 1200, height: 900, crop: "limit" },
        { fetch_format: "auto" },
        { quality: "auto" },
      ],
    });
  },
};
