import { AppError } from "../../../shared/errors/app-error.js";
import { cloudinaryStorage } from "./cloudinary-storage.js";
import type { ImageStorage } from "./image-storage.js";

export function getImageStorage(provider: string = "CLOUDINARY"): ImageStorage {
  if (provider === "CLOUDINARY") return cloudinaryStorage;
  throw new AppError(500, "IMAGE_STORAGE_PROVIDER_UNSUPPORTED", "The image storage provider is not supported");
}
