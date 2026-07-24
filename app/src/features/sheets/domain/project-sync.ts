export type ProjectSyncData = {
  title?: string;
  phase?: string;
  category?: string;
  client?: string;
  commune?: string;
  workStatus?: string;
  billing?: string;
  notes?: string;
};

export type ProjectSyncUpdate = ProjectSyncData & { id: string };

type EditableProjectRow = Required<ProjectSyncUpdate>;

export function buildProjectSyncUpdates<T extends EditableProjectRow>(
  rows: readonly T[],
  dirtyIds: ReadonlySet<string>,
): ProjectSyncUpdate[] {
  return rows
    .filter((row) => dirtyIds.has(row.id))
    .map(({ id, title, phase, category, client, commune, workStatus, billing, notes }) => ({
      id,
      title,
      phase,
      category,
      client,
      commune,
      workStatus,
      billing,
      notes,
    }));
}

export function toProjectSyncData({
  title,
  phase,
  category,
  client,
  commune,
  workStatus,
  billing,
  notes,
}: ProjectSyncUpdate): ProjectSyncData {
  return {
    ...(title !== undefined ? { title } : {}),
    ...(phase !== undefined ? { phase } : {}),
    ...(category !== undefined ? { category } : {}),
    ...(client !== undefined ? { client } : {}),
    ...(commune !== undefined ? { commune } : {}),
    ...(workStatus !== undefined ? { workStatus } : {}),
    ...(billing !== undefined ? { billing } : {}),
    ...(notes !== undefined ? { notes } : {}),
  };
}
