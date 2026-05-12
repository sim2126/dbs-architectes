import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ProjectsView = "table" | "grid" | "map";
export type DensityMode = "compact" | "default" | "comfortable";

interface UserPrefs {
  // Projects
  projectsView: ProjectsView;
  setProjectsView: (v: ProjectsView) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;

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
