/**
 * Safely escapes a string for CSV export.
 * Handles:
 * - Quotes (by doubling them)
 * - Commas and newlines (by wrapping the entire field in quotes)
 * - Spreadsheet Formula Injection (by prepending a single quote to fields starting with =, +, -, @)
 */
export const escapeCsvField = (field: any): string => {
  if (field === null || field === undefined) {
    return '';
  }

  let str = String(field);

  // Protect against spreadsheet formula injection (CSV Injection)
  if (str.startsWith('=') || str.startsWith('+') || str.startsWith('-') || str.startsWith('@')) {
    str = "'" + str;
  }

  // If the string contains a quote, comma, or newline, quote it and escape existing quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
};

/**
 * Converts an array of values into a safe CSV row string (without trailing newline).
 */
export const toCsvRow = (row: any[]): string => {
  return row.map(escapeCsvField).join(',');
};
