const PROJECT_WORK_STATUSES = ["todo", "doing", "stuck", "completed"] as const;

export type ProjectWorkStatus = (typeof PROJECT_WORK_STATUSES)[number];

export type ProjectPageQuery = {
  status?: ProjectWorkStatus;
  scope?: "mine";
};

type SearchParams = Record<string, string | string[] | undefined>;

type QueryProject = {
  phase: string;
  workStatus: string;
  assignments: ReadonlyArray<{ userId: string }>;
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseProjectPageQuery(searchParams: SearchParams): ProjectPageQuery {
  const requestedStatus = first(searchParams.status)?.trim().toLowerCase();
  const requestedScope = first(searchParams.scope)?.trim().toLowerCase();

  return {
    ...((PROJECT_WORK_STATUSES as readonly string[]).includes(requestedStatus ?? "")
      ? { status: requestedStatus as ProjectWorkStatus }
      : {}),
    ...(requestedScope === "mine" ? { scope: "mine" as const } : {}),
  };
}

export function projectMatchesPageQuery(
  project: QueryProject,
  query: ProjectPageQuery,
  currentUserId: string,
): boolean {
  const matchesScope =
    query.scope !== "mine" || project.assignments.some(({ userId }) => userId === currentUserId);
  const matchesStatus =
    query.status === undefined ||
    (query.status === "stuck"
      ? project.workStatus === "stuck" || project.phase === "STUCK"
      : project.workStatus === query.status);

  return matchesScope && matchesStatus;
}
