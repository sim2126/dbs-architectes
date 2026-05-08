// Friday brand tokens — runtime mirror of the CSS variables defined in
// globals.css. Use these in TS code that needs to reference a token by
// name (charts, motion, dynamic styles). Components should still prefer
// Tailwind utilities (bg-friday-surface, text-friday-fg-muted, etc.)
// when emitting JSX.

export const FRIDAY_TOKENS = {
  // Surfaces
  bg: "var(--friday-bg)",
  surface: "var(--friday-surface)",
  surface2: "var(--friday-surface-2)",
  surface3: "var(--friday-surface-3)",

  // Borders
  border: "var(--friday-border)",
  borderSoft: "var(--friday-border-soft)",

  // Foreground
  fg: "var(--friday-fg)",
  fgMuted: "var(--friday-fg-muted)",
  fgSubtle: "var(--friday-fg-subtle)",

  // Accent
  accent: "var(--friday-accent)",
  accentFg: "var(--friday-accent-fg)",
  accentSoft: "var(--friday-accent-soft)",
  accentRing: "var(--friday-accent-ring)",

  // Phase palette — both vocabularies. DB names map to design colors via
  // PHASE_DB_TO_SIA below; the SIA codes are what Claude Design's screens
  // actually consume.
  phase: {
    // DB-name vocabulary (legacy; what's in prisma.project.phase)
    "ETUDE/AP": "var(--phase-etude-ap)",
    "MAE": "var(--phase-mae)",
    "CHANTIER": "var(--phase-chantier)",
    "EXE/DG/DV/3D": "var(--phase-exe)",
    "TERMINATO": "var(--phase-terminato)",
    "STUCK": "var(--phase-stuck)",
    "CONCORSO": "var(--phase-concorso)",
    // SIA-code vocabulary (design)
    p11: "var(--phase-p11)",
    p21: "var(--phase-p21)",
    p31: "var(--phase-p31)",
    p32: "var(--phase-p32)",
    p41: "var(--phase-p41)",
    p51: "var(--phase-p51)",
    p52: "var(--phase-p52)",
    p53: "var(--phase-p53)",
  } as const,

  // Work status palette — both vocabularies. STATUS_DB_TO_DESIGN below
  // maps Monday-style DB statuses to design statuses.
  status: {
    // DB vocabulary
    todo: "var(--status-todo)",
    doing: "var(--status-doing)",
    stuck: "var(--status-stuck)",
    completed: "var(--status-completed)",
    // Design vocabulary
    onTrack: "var(--status-on-track)",
    atRisk: "var(--status-at-risk)",
    delayed: "var(--status-delayed)",
    done: "var(--status-done)",
  } as const,
} as const;

export const FRIDAY_TYPE = {
  display: "var(--font-friday-display), Georgia, serif",
  serif: "var(--font-friday-serif), Georgia, serif",
  sans: "var(--font-friday-sans), system-ui, sans-serif",
  mono: "var(--font-friday-mono), ui-monospace, monospace",
} as const;

export const FRIDAY_MOTION = {
  fast: "100ms",
  hover: "160ms",
  tab: "220ms",
  modal: "200ms",
  accordion: "180ms",
  ease: "cubic-bezier(0.32, 0.08, 0.24, 1)",
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

export type PhaseName = keyof typeof FRIDAY_TOKENS.phase;
export type WorkStatus = keyof typeof FRIDAY_TOKENS.status;

// Approximate mapping from DB phase names → SIA codes. Used when a
// component is given a DB-name phase but needs the design's SIA-coded
// label (e.g., "MAE" → "p32"). Imperfect by design — DB and SIA are
// not 1:1 and the firm may move records between them.
const PHASE_DB_TO_SIA: Record<string, PhaseName> = {
  "ETUDE/AP": "p11",
  CONCORSO: "p21",
  MAE: "p32",
  CHANTIER: "p51",
  "EXE/DG/DV/3D": "p41",
  TERMINATO: "p53",
  STUCK: "p21",
};

const PHASE_SIA_LABEL: Record<string, string> = {
  p11: "Phase 11 — Étude préliminaire",
  p21: "Phase 21 — Faisabilité",
  p31: "Phase 31 — Avant-projet",
  p32: "Phase 32 — Projet",
  p41: "Phase 41 — DAP",
  p51: "Phase 51 — Réalisation A",
  p52: "Phase 52 — Réalisation B",
  p53: "Phase 53 — Mise en service",
};

const STATUS_DB_TO_DESIGN: Record<string, string> = {
  todo: "onTrack",
  doing: "atRisk",
  stuck: "delayed",
  completed: "done",
};

function normalizePhase(input: string): string {
  return input
    .toUpperCase()
    .split("/")
    .map((p) => p.trim())
    .join("/");
}

/**
 * Look up a phase color. Accepts both vocabularies:
 *   - DB names: "ETUDE/AP", "MAE", "CHANTIER", "EXE/DG/DV/3D", "TERMINATO", "STUCK", "CONCORSO"
 *   - SIA codes: "p11", "p21", "p31", "p32", "p41", "p51", "p52", "p53"
 * Whitespace-tolerant. Returns a sensible fallback for unknown values.
 */
export function getPhaseColor(phase: string | null | undefined): string {
  if (!phase) return "var(--friday-fg-subtle)";
  const map = FRIDAY_TOKENS.phase as Record<string, string>;
  // SIA code (lowercase pXX)
  if (/^p\d{2}$/.test(phase) && map[phase]) return map[phase];
  // DB name (uppercase, slash-tolerant)
  const norm = normalizePhase(phase);
  return map[norm] ?? "var(--friday-fg-subtle)";
}

/**
 * Look up a phase display label. SIA codes get the canonical label;
 * DB names are returned as-is (Title-cased) unless they map to an SIA
 * label via the DB→SIA bridge.
 */
export function getPhaseLabel(phase: string | null | undefined): string {
  if (!phase) return "—";
  if (/^p\d{2}$/.test(phase)) return PHASE_SIA_LABEL[phase] ?? phase;
  const norm = normalizePhase(phase);
  const sia = PHASE_DB_TO_SIA[norm];
  if (sia) return PHASE_SIA_LABEL[sia];
  return norm;
}

/**
 * Look up a status color. Accepts both vocabularies:
 *   - DB: "todo", "doing", "stuck", "completed"
 *   - Design: "onTrack", "atRisk", "delayed", "done"
 * Case-tolerant.
 */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return "var(--friday-fg-subtle)";
  const map = FRIDAY_TOKENS.status as Record<string, string>;
  // Try the value verbatim first (handles design vocabulary like "onTrack")
  if (map[status]) return map[status];
  // Then lowercase (handles DB vocabulary)
  if (map[status.toLowerCase()]) return map[status.toLowerCase()];
  return "var(--friday-fg-subtle)";
}

/** Map a DB-name work status to its design-vocabulary equivalent. */
export function statusDbToDesign(status: string | null | undefined): string | null {
  if (!status) return null;
  return STATUS_DB_TO_DESIGN[status.toLowerCase()] ?? null;
}
