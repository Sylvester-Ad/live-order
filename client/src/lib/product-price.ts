export type PesewasParseResult =
  | { ok: true; value: number }
  | { ok: false; message: string };

/** Parse a decimal GHS amount without using floating-point arithmetic. */
export function parseCedisToPesewas(input: string): PesewasParseResult {
  const value = input.trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);

  if (!match) {
    return { ok: false, message: "Enter an amount with up to two decimal places." };
  }

  const wholeCedis = BigInt(match[1] ?? "0");
  const fractionalPesewas = BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  const pesewas = wholeCedis * 100n + fractionalPesewas;

  if (pesewas <= 0n) {
    return { ok: false, message: "Price must be greater than zero." };
  }

  if (pesewas > BigInt(Number.MAX_SAFE_INTEGER)) {
    return { ok: false, message: "This price is too large to represent safely." };
  }

  return { ok: true, value: Number(pesewas) };
}

export function pesewasToCedisInput(amount: number): string {
  const wholeCedis = Math.trunc(amount / 100);
  const fractionalPesewas = Math.abs(amount % 100).toString().padStart(2, "0");
  return `${wholeCedis}.${fractionalPesewas}`;
}
