/**
 * deleteProject — hard delete; the auth gate is the only guard.
 *
 * Currently cascades via Prisma onDelete: Cascade declarations. If
 * we ever need soft-delete (preserve history), this is the single
 * function to change.
 */

import { prisma } from "@/platform/db";

export async function deleteProject(projectId: string): Promise<void> {
  await prisma.project.delete({ where: { id: projectId } });
}
