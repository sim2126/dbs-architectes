export type LegacyTaskSource = {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  dueDate: Date | null;
  status: string;
  priority: string;
  projectId: string | null;
  position: number;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type LegacyAgendaSource = {
  id: string;
  title: string;
  description: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  type: string;
  legacyAgendaType: string | null;
  priority: string;
  status: string;
  projectId: string | null;
  userId: string;
  color: string | null;
  allDay: boolean;
  googleEventId: string | null;
  sourceSystem: string | null;
  sourceId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toLegacyTask(item: LegacyTaskSource) {
  return {
    id: item.id,
    userId: item.userId,
    title: item.title,
    description: item.description,
    dueDate: item.dueDate,
    status: item.status,
    priority: item.priority,
    projectId: item.projectId,
    position: item.position,
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function getLegacyAgendaDate(
  item: Pick<LegacyAgendaSource, "id" | "startDate" | "dueDate">,
): Date {
  const date = item.startDate ?? item.dueDate;
  if (!date) {
    throw new Error(`Agenda-compatible WorkItem ${item.id} has no scheduled date.`);
  }
  return date;
}

export function getLegacyAgendaType(
  item: Pick<LegacyAgendaSource, "type" | "legacyAgendaType">,
): string {
  return item.legacyAgendaType ?? item.type;
}

export function toLegacyAgendaItem(item: LegacyAgendaSource) {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    date: getLegacyAgendaDate(item),
    endDate: item.startDate ? item.dueDate : null,
    type: getLegacyAgendaType(item),
    priority: item.priority,
    status: item.status,
    projectId: item.projectId,
    userId: item.userId,
    color: item.color,
    allDay: item.allDay,
    googleEventId: item.googleEventId,
    sourceSystem: item.sourceSystem,
    sourceId: item.sourceId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function compareAgendaItems(
  left: Pick<LegacyAgendaSource, "id" | "startDate" | "dueDate">,
  right: Pick<LegacyAgendaSource, "id" | "startDate" | "dueDate">,
): number {
  return getLegacyAgendaDate(left).getTime() - getLegacyAgendaDate(right).getTime();
}
