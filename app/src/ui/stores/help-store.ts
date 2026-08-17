import { create } from "zustand";

/**
 * Open/closed state for the help dialog.
 *
 * Exists so the account menu can trigger help without importing it.
 * `ui/` may not depend on `features/` (app/CLAUDE.md §8.1) — the sidebar
 * lives in ui/layout and the dialog is a support feature, so the trigger
 * and the dialog cannot reference each other directly.
 *
 * The store is the seam: ui/ sets the flag, and the dashboard layout —
 * which is in app/ and may import features — mounts the dialog.
 *
 * Not persisted. A help dialog that reopens itself after a reload would be
 * a bug, not a convenience.
 */
interface HelpStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useHelpStore = create<HelpStore>()((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));
