import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPublicOrderIdempotencyKey,
  getPublicOrderIdempotencyKey,
} from "../../../src/features/orders/lib/public-order-idempotency";

describe("public order idempotency key storage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("retains only the opaque key across a page reload and creates a fresh key after confirmation", () => {
    const keys = [
      "02d2ef49-0298-4ce1-9c46-e9e39c4f6449",
      "7bb2fa8c-bb51-4b7b-ae69-b617e463fe68",
    ];
    vi.spyOn(window.crypto, "randomUUID")
      .mockReturnValueOnce(keys[0]!)
      .mockReturnValueOnce(keys[1]!);

    const firstAttemptKey = getPublicOrderIdempotencyKey("friday-collection");
    const keyReadAfterReload = getPublicOrderIdempotencyKey("friday-collection");
    expect(keyReadAfterReload).toBe(firstAttemptKey);
    expect(sessionStorage.getItem("liveorder:public-order-idempotency:friday-collection")).toBe(firstAttemptKey);

    clearPublicOrderIdempotencyKey("friday-collection");
    expect(getPublicOrderIdempotencyKey("friday-collection")).toBe(keys[1]);
  });

  it("keeps separate keys for separate public Lives", () => {
    vi.spyOn(window.crypto, "randomUUID")
      .mockReturnValueOnce("02d2ef49-0298-4ce1-9c46-e9e39c4f6449")
      .mockReturnValueOnce("7bb2fa8c-bb51-4b7b-ae69-b617e463fe68");

    expect(getPublicOrderIdempotencyKey("first-live")).not.toBe(
      getPublicOrderIdempotencyKey("second-live"),
    );
  });
});
