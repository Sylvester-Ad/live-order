import { describe, expect, it } from "vitest";

import { formatPesewas } from "../../src/lib/format-money";
import { parseCedisToPesewas, pesewasToCedisInput } from "../../src/lib/product-price";
import { parseProductOptions, readProductOptionGroups, type ProductOptionGroup } from "../../src/lib/product-options";

describe("product price conversion", () => {
  it.each([
    ["25", 2500],
    ["25.5", 2550],
    ["25.50", 2550],
    [" 0.01 ", 1],
  ])("parses GHS %s into integer pesewas", (input, expected) => {
    expect(parseCedisToPesewas(input)).toEqual({ ok: true, value: expected });
  });

  it.each(["", "0", "-1", "1.001", "1,000", "1e2", "21474836.48", "90071992547409.92"])(
    "rejects invalid or unsafe price input %s",
    (input) => expect(parseCedisToPesewas(input).ok).toBe(false),
  );

  it("formats pesewas and seeds exact edit values", () => {
    expect(formatPesewas(2550)).toBe("GH₵ 25.50");
    expect(formatPesewas(100)).toBe("GH₵ 1.00");
    expect(pesewasToCedisInput(1)).toBe("0.01");
    expect(pesewasToCedisInput(2550)).toBe("25.50");
  });

  it("accepts the largest product price supported by the integer API", () => {
    expect(parseCedisToPesewas("21474836.47")).toEqual({ ok: true, value: 2_147_483_647 });
  });
});

describe("product option groups", () => {
  const groups: ProductOptionGroup[] = [{ id: "size", name: " Size ", choices: [" S ", "M"] }];

  it("serializes named groups as selectable string choices", () => {
    expect(parseProductOptions(groups)).toEqual({ ok: true, value: { Size: ["S", "M"] } });
  });

  it("normalizes existing object-of-string-arrays for the visual editor", () => {
    expect(readProductOptionGroups({ sizes: ["S", "M"] })).toMatchObject({
      supported: true,
      groups: [{ name: "sizes", choices: ["S", "M"] }],
    });
  });

  it("preserves legacy option objects that cannot be represented by groups", () => {
    expect(readProductOptionGroups({ details: { washable: true } })).toEqual({ supported: false });
  });

  it.each([
    [{ id: "1", name: " ", choices: ["S"] }, "Enter a name"],
    [{ id: "1", name: "Size", choices: ["S", " s "] }, "must be unique"],
    [{ id: "1", name: "Size", choices: [""] }, "Complete or remove"],
  ] as const)("rejects incomplete or duplicate choices", (group, message) => {
    expect(parseProductOptions([group]).ok).toBe(false);
    expect(parseProductOptions([group])).toMatchObject({ ok: false, message: expect.stringContaining(message) });
  });
});
