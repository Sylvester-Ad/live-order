const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

function protectSpreadsheetCell(value: string): string {
  if (FORMULA_PREFIX.test(value)) {
    return `'${value}`;
  }

  return value;
}

export function escapeCsvCell(value: unknown): string {
  let text: string;

  if (value === null || value === undefined) {
    text = "";
  } else if (typeof value === "string") {
    text = protectSpreadsheetCell(value);
  } else {
    text = String(value);
  }

  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(
  headers: string[],
  rows: unknown[][],
): string {
  const headerRow = headers.map(escapeCsvCell).join(",");

  const dataRows = rows.map((row) =>
    row.map(escapeCsvCell).join(","),
  );

  return [headerRow, ...dataRows].join("\r\n") + "\r\n";
}