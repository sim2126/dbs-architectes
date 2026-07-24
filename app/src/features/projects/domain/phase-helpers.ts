export const CANONICAL_PROJECT_PHASES = [
  "ETUDE/AP",
  "MAE",
  "CHANTIER",
  "EXE/DG/DV/3D",
  "TERMINATO",
  "STUCK",
  "CONCORSO",
] as const;

export const DEFAULT_PROJECT_PHASE = CANONICAL_PROJECT_PHASES[0];

const CANONICAL_PHASE_BY_CASEFOLD = new Map(
  CANONICAL_PROJECT_PHASES.map((phase) => [phase.toUpperCase(), phase]),
);

export function normaliseProjectPhase(phase: string): string {
  const compact = phase.trim().replace(/\s*\/\s*/g, "/");
  return CANONICAL_PHASE_BY_CASEFOLD.get(compact.toUpperCase()) ?? compact;
}
