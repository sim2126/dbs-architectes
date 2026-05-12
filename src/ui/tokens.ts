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

  // Phase pills (locked palette — keyed by DB phase name, NOT Claude
  // Design's SIA p11/p21/etc. naming)
  phase: {
    "ETUDE/AP": "var(--phase-etude-ap)",
    "MAE": "var(--phase-mae)",
    "CHANTIER": "var(--phase-chantier)",
    "EXE/DG/DV/3D": "var(--phase-exe)",
    "TERMINATO": "var(--phase-terminato)",
    "STUCK": "var(--phase-stuck)",
    "CONCORSO": "var(--phase-concorso)",
  } as const,

  // Work status
  status: {
    todo: "var(--status-todo)",
    doing: "var(--status-doing)",
    stuck: "var(--status-stuck)",
    completed: "var(--status-completed)",
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

/**
 * Look up a phase color by its database name. Whitespace-tolerant
 * (matches both "ETUDE/AP" and "ETUDE / AP"), case-insensitive,
 * with a sensible fallback for unknown values.
 */
export function getPhaseColor(phase: string | null | undefined): string {
  if (!phase) return "var(--friday-fg-subtle)";
  const norm = phase
    .toUpperCase()
    .split("/")
    .map((p) => p.trim())
    .join("/");
  return (FRIDAY_TOKENS.phase as Record<string, string>)[norm] ?? "var(--friday-fg-subtle)";
}

/** Look up a work-status color by its DB name. */
export function getStatusColor(status: string | null | undefined): string {
  if (!status) return "var(--friday-fg-subtle)";
  const map = FRIDAY_TOKENS.status as Record<string, string>;
  return map[status.toLowerCase()] ?? "var(--friday-fg-subtle)";
}
