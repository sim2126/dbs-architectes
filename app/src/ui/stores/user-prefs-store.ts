import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Sidebar width bounds. Below the minimum, nav labels truncate to nothing;
 *  above the maximum, the content area stops being the focus of the page. */
export const SIDEBAR_MIN_WIDTH = 216;
export const SIDEBAR_MAX_WIDTH = 400;
export const SIDEBAR_DEFAULT_WIDTH = 260;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export type ProjectsView = "table" | "grid" | "map";
export type DensityMode = "compact" | "default" | "comfortable";

interface UserPrefs {
  // Projects
  projectsView: ProjectsView;
  setProjectsView: (v: ProjectsView) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

  /** Expanded sidebar width in px. Clamped by setSidebarWidth. */
  sidebarWidth: number;
  setSidebarWidth: (v: number) => void;

  // Table density
  density: DensityMode;
  setDensity: (v: DensityMode) => void;

  // Dashboard — which cards are visible (future use)
  dashboardCards: string[];
  setDashboardCards: (cards: string[]) => void;
}

export const useUserPrefs = create<UserPrefs>()(
  persist(
    (set) => ({
      projectsView: "table",
      setProjectsView: (projectsView) => set({ projectsView }),

      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
      setSidebarWidth: (v) =>
        set({
          // Clamped in the store, not at the call site: a drag handler that
          // forgets to clamp would persist an unusable width that survives
          // a reload.
          sidebarWidth: Math.min(
            SIDEBAR_MAX_WIDTH,
            Math.max(SIDEBAR_MIN_WIDTH, Math.round(v)),
          ),
        }),

      density: "default",
      setDensity: (density) => set({ density }),

      dashboardCards: ["stats", "activity", "ai", "agenda"],
      setDashboardCards: (dashboardCards) => set({ dashboardCards }),
    }),
    {
      name: "friday-user-prefs",
      // Coerce stale persisted view values (kanban was removed from the
      // product) so users with old localStorage don't get a blank page.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if ((state.projectsView as string) === "kanban") {
          state.projectsView = "grid";
        }
      },
    },
  ),
);
