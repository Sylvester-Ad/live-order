export function formatPesewas(amount: number): string {
  const wholeCedis = Math.trunc(amount / 100);
  const pesewaRemainder = Math.abs(amount % 100).toString().padStart(2, "0");

  return `GH₵ ${wholeCedis.toLocaleString("en-GH")}.${pesewaRemainder}`;
}
