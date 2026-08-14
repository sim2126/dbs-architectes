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
  brandMark: "var(--friday-brand-mark)",
  authFeatureIcon: "var(--friday-auth-feature-icon)",

  // Semantic feedback
  success: {
    fg: "var(--friday-success-fg)",
    bg: "var(--friday-success-bg)",
    softFg: "var(--friday-success-soft-fg)",
  },
  denialFg: "var(--friday-denial-fg)",
  warningFill: "var(--friday-warning-fill)",

  // Project health
  health: {
    onTrack: {
      color: "var(--friday-health-on-track)",
      bg: "var(--friday-health-on-track-bg)",
      fg: "var(--friday-health-on-track-fg)",
    },
    atRisk: {
      color: "var(--friday-health-at-risk)",
      bg: "var(--friday-health-at-risk-bg)",
      fg: "var(--friday-health-at-risk-fg)",
    },
    offTrack: {
      color: "var(--friday-health-off-track)",
      bg: "var(--friday-health-off-track-bg)",
      fg: "var(--friday-health-off-track-fg)",
    },
  },

  // Team workload
  workload: {
    balanced: {
      color: "var(--friday-workload-balanced)",
      bg: "var(--friday-workload-balanced-bg)",
      fg: "var(--friday-workload-balanced-fg)",
    },
    heavy: {
      color: "var(--friday-workload-heavy)",
      bg: "var(--friday-workload-heavy-bg)",
      fg: "var(--friday-workload-heavy-fg)",
    },
    overloaded: {
      color: "var(--friday-workload-overloaded)",
      bg: "var(--friday-workload-overloaded-bg)",
      fg: "var(--friday-workload-overloaded-fg)",
    },
  },

  // Activity categories
  activity: {
    projectCreated: "var(--friday-activity-project-created)",
    projectUpdated: "var(--friday-activity-project-updated)",
    projectDeleted: "var(--friday-activity-project-deleted)",
    userJoined: "var(--friday-activity-user-joined)",
    userUpdated: "var(--friday-activity-user-updated)",
    fileUploaded: "var(--friday-activity-file-uploaded)",
    fallback: "var(--friday-activity-fallback)",
  },

  // Agenda presentation; persisted agenda colours remain raw data.
  agenda: {
    task: "var(--friday-agenda-task)",
    deadline: "var(--friday-agenda-deadline)",
    milestone: "var(--friday-agenda-milestone)",
    meeting: "var(--friday-agenda-meeting)",
    fallback: "var(--friday-agenda-fallback)",
  },

  // Stored workspace brand choices are deliberately theme-invariant.
  brandPresets: [
    "var(--friday-brand-preset-1)",
    "var(--friday-brand-preset-2)",
    "var(--friday-brand-preset-3)",
    "var(--friday-brand-preset-4)",
    "var(--friday-brand-preset-5)",
    "var(--friday-brand-preset-6)",
  ],

  chart: {
    category: {
      residential: "var(--chart-1)",
      commercial: "var(--chart-2)",
      industrial: "var(--chart-3)",
      mixed: "var(--chart-4)",
      hospitality: "var(--chart-5)",
      renovation: "var(--friday-chart-renovation)",
    },
    active: "var(--chart-1)",
    stuck: "var(--chart-2)",
    completed: "var(--friday-chart-completed)",
    fallback: "var(--friday-chart-fallback)",
  },

  gradient: {
    authPage: "var(--friday-gradient-auth-page)",
    galleryPage: "var(--friday-gradient-gallery-page)",
    planningPage: "var(--friday-gradient-planning-page)",
    authHero: "var(--friday-gradient-auth-hero)",
    galleryHero: "var(--friday-gradient-gallery-hero)",
    planningHero: "var(--friday-gradient-planning-hero)",
    galleryPlaceholder: "var(--friday-gradient-gallery-placeholder)",
    planningPlaceholder: "var(--friday-gradient-planning-placeholder)",
    plan: "var(--friday-gradient-plan)",
  },

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

/** Raw values are retained for workspace-brand persistence and display. */
export const FRIDAY_BRAND_PRESETS = [
  { value: "#1e3a8a", color: FRIDAY_TOKENS.brandPresets[0] },
  { value: "#7a8b6f", color: FRIDAY_TOKENS.brandPresets[1] },
  { value: "#c4994a", color: FRIDAY_TOKENS.brandPresets[2] },
  { value: "#5a3a3a", color: FRIDAY_TOKENS.brandPresets[3] },
  { value: "#2a3a3a", color: FRIDAY_TOKENS.brandPresets[4] },
  { value: "#1a1a18", color: FRIDAY_TOKENS.brandPresets[5] },
] as const;

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
 * Look up a phase color by its database name. Whitespace-tolerant for
 * legacy slash spacing, case-insensitive,
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

/** Look up an agenda type's presentation colour without changing persisted colour data. */
export function getAgendaTypeColor(type: string | null | undefined): string {
  if (!type) return FRIDAY_TOKENS.agenda.fallback;
  const map = FRIDAY_TOKENS.agenda as Record<string, string>;
  return map[type.toLowerCase()] ?? FRIDAY_TOKENS.agenda.fallback;
}

/** Resolve a Friday CSS colour token for browser APIs that do not understand var(...). */
export function resolveFridayColor(color: string): string {
  const property = /^var\((--[^)]+)\)$/.exec(color)?.[1];
  if (!property) return color;
  if (typeof document === "undefined") {
    throw new Error(`Cannot resolve ${property} outside the browser`);
  }
  const resolved = window.getComputedStyle(document.documentElement).getPropertyValue(property).trim();
  if (!resolved) throw new Error(`Friday colour token ${property} is not defined`);
  return resolved;
}
