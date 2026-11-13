export function getProductImageFileError(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    return "Choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > 5 * 1024 * 1024) {
    return "Product images must be 5 MB or smaller.";
  }
  return null;
}
