export type PublicOrderCartLine = {
  productId: string;
  quantity: number;
  selectedOptions: Record<string, string>;
};

function optionsKey(options: Record<string, string>) {
  return JSON.stringify(Object.entries(options).sort(([left], [right]) => left.localeCompare(right)));
}

export function productQuantityInCart(cart: PublicOrderCartLine[], productId: string) {
  return cart.reduce((quantity, line) => line.productId === productId ? quantity + line.quantity : quantity, 0);
}

export function addProductToCart(
  cart: PublicOrderCartLine[],
  productId: string,
  requestedQuantity: number,
  selectedOptions: Record<string, string>,
  stockQuantity: number,
) {
  const available = Math.max(0, stockQuantity - productQuantityInCart(cart, productId));
  const existingIndex = cart.findIndex((line) =>
    line.productId === productId && optionsKey(line.selectedOptions) === optionsKey(selectedOptions),
  );
  if (existingIndex < 0 && cart.length >= 50) return { cart, added: 0, reason: "line-limit" as const };
  const currentQuantity = existingIndex < 0 ? 0 : cart[existingIndex]?.quantity ?? 0;
  const added = Math.min(Math.max(0, requestedQuantity), available, 100 - currentQuantity);
  if (added === 0) return { cart, added, reason: "stock" as const };

  if (existingIndex >= 0) {
    return {
      cart: cart.map((line, index) => index === existingIndex ? { ...line, quantity: line.quantity + added } : line),
      added,
      reason: null,
    };
  }

  return { cart: [...cart, { productId, quantity: added, selectedOptions: { ...selectedOptions } }], added, reason: null };
}

export function setCartLineQuantity(
  cart: PublicOrderCartLine[],
  lineIndex: number,
  requestedQuantity: number,
  stockQuantity: number,
) {
  const line = cart[lineIndex];
  if (!line) return cart;
  if (requestedQuantity <= 0) return cart.filter((_, index) => index !== lineIndex);

  const otherQuantity = productQuantityInCart(cart, line.productId) - line.quantity;
  const quantity = Math.min(Math.floor(requestedQuantity), 100, Math.max(0, stockQuantity - otherQuantity));
  if (quantity <= 0) return cart.filter((_, index) => index !== lineIndex);
  return cart.map((item, index) => index === lineIndex ? { ...item, quantity } : item);
}

export function removeCartLine(cart: PublicOrderCartLine[], lineIndex: number) {
  return cart.filter((_, index) => index !== lineIndex);
}
