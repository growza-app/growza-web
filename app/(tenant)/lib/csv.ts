/**
 * Jira GRW-476 — one CSV cell, safe to open in a spreadsheet.
 *
 * A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is a formula to Excel and Sheets. A client
 * can choose their own name in the WhatsApp chat, so `=HYPERLINK("http://…","Click")` in the Clients export ran on
 * the owner's machine when they opened the file. Such a cell gets a leading apostrophe, which spreadsheets show as
 * text. A plain number — a negative amount included — is left alone, so its column still adds up.
 */
export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) || s.startsWith("'") ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rows of cells, one line each. */
export function csvLines(lines: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>): string {
  return lines.map((line) => line.map(csvCell).join(',')).join('\n');
}
