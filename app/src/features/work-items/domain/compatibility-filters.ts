import type { Prisma } from "@prisma/client";

export const personalTaskWorkItemWhere = {
  legacyTaskId: { not: null },
} satisfies Prisma.WorkItemWhereInput;

// Existing Agenda-shaped surfaces include migrated AgendaItem rows and new
// canonical/Monday WorkItems, while excluding migrated personal Tasks.
export const scheduledWorkItemWhere = {
  legacyTaskId: null,
  OR: [{ startDate: { not: null } }, { dueDate: { not: null } }],
} satisfies Prisma.WorkItemWhereInput;
