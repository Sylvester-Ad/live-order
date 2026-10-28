import { describe, expect, it } from "vitest";

import { addProductToCart, productQuantityInCart, removeCartLine, setCartLineQuantity, type PublicOrderCartLine } from "../../../src/features/public-live/lib/public-order-cart";

describe("public order cart", () => {
  it("merges repeated identical product selections and keeps distinct products separate", () => {
    const first = addProductToCart([], "shirt", 2, { Size: "M", Colour: "Black" }, 5);
    const repeated = addProductToCart(first.cart, "shirt", 1, { Colour: "Black", Size: "M" }, 5);
    const anotherProduct = addProductToCart(repeated.cart, "cap", 1, {}, 5);

    expect(anotherProduct.cart).toHaveLength(2);
    expect(anotherProduct.cart[0]).toMatchObject({ productId: "shirt", quantity: 3 });
    expect(anotherProduct.cart[1]).toMatchObject({ productId: "cap", quantity: 1 });
  });

  it("keeps option selections as separate lines while sharing product stock", () => {
    const black = addProductToCart([], "shirt", 2, { Colour: "Black" }, 3);
    const white = addProductToCart(black.cart, "shirt", 2, { Colour: "White" }, 3);

    expect(white.added).toBe(1);
    expect(white.cart).toHaveLength(2);
    expect(productQuantityInCart(white.cart, "shirt")).toBe(3);
  });

  it("prevents zero-stock additions and clamps quantity changes to available stock", () => {
    const empty = addProductToCart([], "sold-out", 1, {}, 0);
    const cart = addProductToCart([], "shirt", 3, {}, 4).cart;
    const capped = setCartLineQuantity(cart, 0, 20, 5);

    expect(empty.added).toBe(0);
    expect(empty.cart).toHaveLength(0);
    expect(capped[0]?.quantity).toBe(5);
    expect(removeCartLine(capped, 0)).toHaveLength(0);
  });

  it("matches the API limit of 50 separate product selections per order", () => {
    let cart: PublicOrderCartLine[] = [];
    for (let index = 0; index < 50; index += 1) {
      cart = addProductToCart(cart, `product-${index}`, 1, {}, 1).cart;
    }
    const result = addProductToCart(cart, "product-51", 1, {}, 1);

    expect(result.added).toBe(0);
    expect(result.reason).toBe("line-limit");
    expect(result.cart).toHaveLength(50);
  });
});
