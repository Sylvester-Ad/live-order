import { describe, expect, it, vi } from "vitest";

import { createWithOrderReference } from "../../src/modules/orders/order-reference.js";

const collision = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
  meta: { target: ["reference"] },
});

describe("order reference generation", () => {
  it("retries a unique-reference collision before persisting the order", async () => {
    const create = vi.fn().mockRejectedValueOnce(collision).mockResolvedValue("created-order");
    const generate = vi.fn().mockReturnValueOnce("ORD-COLLISION").mockReturnValueOnce("ORD-UNIQUE");

    await expect(createWithOrderReference(create, generate)).resolves.toBe("created-order");
    expect(create).toHaveBeenNthCalledWith(1, "ORD-COLLISION");
    expect(create).toHaveBeenNthCalledWith(2, "ORD-UNIQUE");
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("stops after the bounded number of reference collisions", async () => {
    const create = vi.fn().mockRejectedValue(collision);
    const generate = vi.fn(() => "ORD-COLLISION");

    await expect(createWithOrderReference(create, generate)).rejects.toMatchObject({
      statusCode: 503,
      code: "ORDER_REFERENCE_UNAVAILABLE",
    });
    expect(create).toHaveBeenCalledTimes(5);
    expect(generate).toHaveBeenCalledTimes(5);
  });
});
