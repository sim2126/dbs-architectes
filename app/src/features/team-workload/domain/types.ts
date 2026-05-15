/**
 * Team workload domain types — shared between the server fan-out
 * (loadTeamWorkload) and the client view (TeamWorkloadClient).
 *
 * Pure types, no runtime dependencies — safe to import from either side.
 */

export type WorkloadLoadLevel = "light" | "balanced" | "heavy" | "overloaded";

export type WorkloadProject = {
  id: string;
  code: string;
  title: string;
  phase: string;
  workStatus: string;
  /** The user's assignment role on this project ("lead" | "editor" | …). */
  assignmentRole: string | null;
};

export type WorkloadTaskBucket = {
  open: number;
  doing: number;
  overdue: number;
  dueThisWeek: number;
};

export type WorkloadAgendaBucket = {
  total: number;
  next7days: number;
  overdue: number;
};

export type WorkloadStatusUpdate = {
  health: "on_track" | "at_risk" | "off_track";
  createdAt: string;
  projectCode: string;
};

export type TeamMemberWorkload = {
  user: {
    id: string;
    name: string | null;
    email: string;
    initials: string | null;
    image: string | null;
    role: string;
    defaultCountry: string | null;
  };
  projects: WorkloadProject[];
  tasks: WorkloadTaskBucket;
  agenda: WorkloadAgendaBucket;
  /** Most recent status update they authored, if any (across all their projects). */
  latestStatus: WorkloadStatusUpdate | null;
  /** Score-based bucket — see scoreToLoad() in load-team-workload.ts. */
  load: WorkloadLoadLevel;
  /** Composite score (0+). Higher = more loaded. Useful for sorting. */
  score: number;
};

export type TeamWorkloadData = {
  members: TeamMemberWorkload[];
  /** ISO timestamp the snapshot was generated. */
  generatedAt: string;
};
