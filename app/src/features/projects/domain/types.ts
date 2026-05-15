/**
 * Project feature — shared types.
 *
 * Lives in domain/ because it crosses the server/client boundary:
 * the server function loadProjectDetail() returns it, the client
 * ProjectDetail component consumes it. Pure types, no runtime
 * dependencies — safe to import from either side.
 */

export type ProjectSummary = {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  category: string;
  client: string | null;
  year: number | null;
  commune: string | null;
  typology: string | null;
  terrain: string | null;
  roof: string | null;
  description: string | null;
  image: string | null;
  floors: number | null;
  area: number | null;
  billing: string | null;
  country: string | null;
  operatingRegion: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  pageLink: string | null;
  updatedAt: string;
};

export type ProjectAssignmentRow = {
  userId: string;
  role: string | null;
  user: {
    id: string;
    name: string | null;
    email: string;
    initials: string | null;
    image: string | null;
    role: string;
  };
};

export type ProjectAgendaRow = {
  id: string;
  title: string;
  date: string;
  status: string;
  priority: string;
  type: string;
};

export type ProjectActivityRow = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { id: string; name: string | null; initials: string | null; image: string | null } | null;
};

export type ProjectFileRow = {
  id: string;
  kind: "plan" | "image";
  title: string;
  url: string;
  type: string;
  year: number | null;
  createdAt: string;
};

export type ThreadMessageAuthor = {
  id: string;
  name: string | null;
  initials: string | null;
  image: string | null;
};

export type ProjectThreadRow = {
  id: string;
  content: string;
  createdAt: string;
  user: ThreadMessageAuthor | null;
  replies: Array<{
    id: string;
    content: string;
    createdAt: string;
    user: ThreadMessageAuthor | null;
  }>;
};

/** Shape returned by loadProjectDetail(), consumed by <ProjectDetail />. */
export type ProjectDetailData = {
  project: ProjectSummary;
  assignments: ProjectAssignmentRow[];
  agenda: ProjectAgendaRow[];
  activities: ProjectActivityRow[];
  files: ProjectFileRow[];
  threads: ProjectThreadRow[];
  starred: boolean;
  currentUserId: string;
  isAdmin: boolean;
  /**
   * Derived server-side from authorize(subject, "project:assign", resource).
   * True when the caller can add/remove/relabel members on this project —
   * directors/admins and the project's own leads. Drives the "Add member"
   * and per-row controls in the Team section.
   */
  canAssignMembers: boolean;
};
