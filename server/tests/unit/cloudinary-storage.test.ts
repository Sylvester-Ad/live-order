import { describe, expect, it } from "vitest";

import { cloudinaryStorage } from "../../src/modules/products/image-storage/cloudinary-storage.js";

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
});
