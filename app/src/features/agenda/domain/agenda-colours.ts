/** Raw values persisted through /api/agenda. Keep these as hex data. */
export const AGENDA_TYPE_COLOURS = {
  task: "#3b82f6",
  deadline: "#ef4444",
  milestone: "#22c55e",
  meeting: "#f59e0b",
} as const;

export const DEFAULT_AGENDA_COLOUR = AGENDA_TYPE_COLOURS.task;
