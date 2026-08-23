const PROJECT_WORK_STATUSES = ["todo", "doing", "stuck", "completed"] as const;

export type ProjectWorkStatus = (typeof PROJECT_WORK_STATUSES)[number];

export type ProjectPageQuery = {
  status?: ProjectWorkStatus;
  scope?: "mine";
  /**
   * A single project by its code.
   *
   * Added for DBS AI. Its answers name projects by code, and the link out of
   * an answer previously pointed at ?code= which nothing read — so "these
   * three projects are stuck" led to the unfiltered list of all of them,
   * which is the opposite of helpful.
   */
  code?: string;
};

type SearchParams = Record<string, string | string[] | undefined>;

type QueryProject = {
  code: string;
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
  // Codes are uppercase by convention; normalised on both sides so a link
  // that arrives lowercased still resolves.
  const requestedCode = first(searchParams.code)?.trim().toUpperCase();

  return {
    ...((PROJECT_WORK_STATUSES as readonly string[]).includes(requestedStatus ?? "")
      ? { status: requestedStatus as ProjectWorkStatus }
      : {}),
    ...(requestedScope === "mine" ? { scope: "mine" as const } : {}),
    ...(requestedCode ? { code: requestedCode } : {}),
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

  const matchesCode =
    query.code === undefined || project.code.trim().toUpperCase() === query.code;

  return matchesScope && matchesStatus && matchesCode;
}
