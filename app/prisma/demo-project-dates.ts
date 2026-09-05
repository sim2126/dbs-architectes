/**
 * Plausible start and end dates for a demo project.
 *
 * Derived from the project's own code and phase rather than drawn at random,
 * because the seed has to produce the same database twice — there is a test
 * that says so. The shape of the answer is the point: an early-phase project
 * runs for a few months, a construction phase runs for most of a year, and a
 * completed one sits in the past.
 *
 * Invented data for a demo. Real dates arrive with the real projects.
 */

/** Roughly how long each phase lasts, in days. */
const PHASE_DAYS: Record<string, number> = {
  "ETUDE/AP": 120,
  MAE: 90,
  "EXE/DG/DV/3D": 210,
  CHANTIER: 320,
  TERMINATO: 240,
  STUCK: 150,
};

const DEFAULT_DAYS = 150;

/** A small stable number from a string, so the same code always gives the same day. */
function fingerprint(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 100_000;
  }
  return hash;
}

export function demoProjectDates(
  code: string,
  year: number | null,
  phase: string,
): { startDate: Date; endDate: Date } {
  const seed = fingerprint(code);
  const startYear = year ?? 2026;
  // Spread starts across the year, never on the 29th to 31st so no month is
  // short of the day asked for.
  const month = seed % 12;
  const day = 1 + (seed % 28);
  const startDate = new Date(Date.UTC(startYear, month, day));

  const length = PHASE_DAYS[phase] ?? DEFAULT_DAYS;
  const endDate = new Date(startDate.getTime() + length * 86_400_000);
  return { startDate, endDate };
}
