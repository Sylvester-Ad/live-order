import { v2 as cloudinary } from "cloudinary";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cloudinaryStorage } from "../../src/modules/products/image-storage/cloudinary-storage.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("Cloudinary product image delivery URLs", () => {
  it("bounds dimensions and requests automatic format and quality", () => {
    const url = cloudinaryStorage.deliveryUrl(
      "liveorder/products/shirt",
      "https://res.cloudinary.com/test-cloud/image/upload/v123/liveorder/products/shirt.png",
    );

    expect(new URL(url).origin).toBe("https://res.cloudinary.com");
    expect(new URL(url).pathname).toBe(
      "/test-cloud/image/upload/c_limit,h_900,w_1200/f_auto/q_auto/v123/liveorder/products/shirt",
    );
  });

  it("preserves URLs that are not Cloudinary delivery URLs", () => {
    const originalUrl = "https://images.example/shirt.png";
    expect(cloudinaryStorage.deliveryUrl("shirt", originalUrl)).toBe(originalUrl);
  });

  it("treats a provider not-found response as successful deletion", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    const destroy = vi.spyOn(cloudinary.uploader, "destroy")
      .mockResolvedValue({ result: "not found" } as never);

    await expect(cloudinaryStorage.delete("liveorder/product-image-uploads/test"))
      .resolves.toBeUndefined();
    expect(destroy).toHaveBeenCalledWith(
      "liveorder/product-image-uploads/test",
      { resource_type: "image" },
    );
  });
});
