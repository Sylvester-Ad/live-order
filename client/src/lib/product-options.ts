export type ProductOptionValue = string | number | boolean | null | ProductOptionValue[] | { [key: string]: ProductOptionValue };
export type ProductOptions = Record<string, ProductOptionValue>;

export type ProductOptionsParseResult =
  | { ok: true; value: ProductOptions }
  | { ok: false; message: string };

function isProductOptionValue(value: unknown): value is ProductOptionValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isProductOptionValue);
  if (typeof value === "object") {
    return Object.values(value).every(isProductOptionValue);
  }
  return false;
}

export function parseProductOptions(input: string): ProductOptionsParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input) as unknown;
  } catch {
    return { ok: false, message: "Enter valid JSON for product options." };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, message: "Options must be a JSON object, such as {\"sizes\":[\"S\",\"M\"]}." };
  }

  if (!Object.values(parsed).every(isProductOptionValue)) {
    return { ok: false, message: "Options must contain valid JSON values." };
  }

  const options: ProductOptions = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isProductOptionValue(value)) {
      Object.defineProperty(options, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
    }
  }
  return { ok: true, value: options };
}
