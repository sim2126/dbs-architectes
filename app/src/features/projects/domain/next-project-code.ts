/**
 * The next project code in the house format, `DBS-<year>-<sequence>`.
 *
 * The board adds a project the way Monday adds an item: you type a name and
 * press Enter. Nobody is asked to invent a reference, so the server allocates
 * one. Pure so the numbering rule can be tested without a database.
 */

const CODE_PREFIX = "DBS";

/** Sequence number in a code for the given year, or null if it is not one. */
export function sequenceOf(code: string, year: number): number | null {
  const match = code.trim().toUpperCase().match(/^DBS-(\d{4})-(\d+)$/);
  if (!match) return null;
  if (Number(match[1]) !== year) return null;
  return Number(match[2]);
}

/**
 * Highest existing sequence for the year, plus one, padded to three digits.
 *
 * Padding widens rather than wrapping past 999: a studio that files a
 * thousand projects in a year deserves a four-digit code, not a collision.
 */
export function nextProjectCode(year: number, existingCodes: readonly string[]): string {
  let highest = 0;
  for (const code of existingCodes) {
    const sequence = sequenceOf(code, year);
    if (sequence !== null && sequence > highest) highest = sequence;
  }
  const next = highest + 1;
  return `${CODE_PREFIX}-${year}-${String(next).padStart(3, "0")}`;
}
