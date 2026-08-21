import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Open/closed and width for the DBS GPT panel.
 *
 * Width is persisted, open state is not. A panel that reopens itself on every
 * page load is an imposition; a panel that forgets how wide you made it is an
 * irritation. Only one of those is worth remembering.
 *
 * Lives in ui/ so the header (ui/layout) can toggle it without importing the
 * assistant feature — app/CLAUDE.md 8.1 forbids ui/ depending on features/.
 * The dashboard layout mounts the panel and reads the same store.
 */

export const ASSISTANT_MIN_WIDTH = 340;
export const ASSISTANT_MAX_WIDTH = 720;
export const ASSISTANT_DEFAULT_WIDTH = 440;

interface AssistantStore {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  width: number;
  setWidth: (width: number) => void;
}

export const useAssistantStore = create<AssistantStore>()(
  persist(
    (set) => ({
      open: false,
      setOpen: (open) => set({ open }),
      toggle: () => set((s) => ({ open: !s.open })),

      width: ASSISTANT_DEFAULT_WIDTH,
      setWidth: (width) =>
        set({
          // Clamped in the store, not the drag handler: a caller that forgets
          // would otherwise persist an unusable width that survives a reload.
          width: Math.min(
            ASSISTANT_MAX_WIDTH,
            Math.max(ASSISTANT_MIN_WIDTH, Math.round(width)),
          ),
        }),
    }),
    {
      name: "dbs-assistant",
      // Deliberately excludes `open`.
      partialize: (s) => ({ width: s.width }) as Partial<AssistantStore>,
    },
  ),
);
