import { describe, expect, it } from "vitest";

import { formatPesewas } from "../../src/lib/format-money";
import { parseCedisToPesewas, pesewasToCedisInput } from "../../src/lib/product-price";
import { parseProductOptions } from "../../src/lib/product-options";

describe("product price conversion", () => {
  it.each([
    ["25", 2500],
    ["25.5", 2550],
    ["25.50", 2550],
    [" 0.01 ", 1],
  ])("parses GHS %s into integer pesewas", (input, expected) => {
    expect(parseCedisToPesewas(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "0", "-1", "1.001", "1,000", "1e2", "90071992547409.92"])(
    "rejects invalid or unsafe price input %s",
    (input) => expect(parseCedisToPesewas(input).ok).toBe(false),
  );

  it("formats pesewas and seeds exact edit values", () => {
    expect(formatPesewas(2550)).toBe("GH₵ 25.50");
    expect(formatPesewas(100)).toBe("GH₵ 1.00");
    expect(pesewasToCedisInput(1)).toBe("0.01");
    expect(pesewasToCedisInput(2550)).toBe("25.50");
  });
});

describe("product option JSON", () => {
  it("accepts and preserves nested JSON object values", () => {
    const result = parseProductOptions('{"sizes":["S","M"],"details":{"washable":true}}');
    expect(result).toEqual({
      ok: true,
      value: { sizes: ["S", "M"], details: { washable: true } },
    });
  });

  it("preserves special object keys without treating them as object mutation", () => {
    const result = parseProductOptions('{"__proto__":{"kept":true}}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.hasOwn(result.value, "__proto__")).toBe(true);
  });

  it.each(["{broken", "null", "[]", "\"text\"", "{\"n\":1e400}"])(
    "rejects options that are not finite JSON objects: %s",
    (input) => expect(parseProductOptions(input).ok).toBe(false),
  );
});
