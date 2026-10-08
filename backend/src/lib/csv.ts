/**
 * RFC 4180 CSV with spreadsheet formula-injection protection: a cell that starts with = + - @ tab or
 * carriage return is prefixed with an apostrophe so Excel and Sheets show it as text.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: readonly string[], rows: Iterable<readonly unknown[]>): string {
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
