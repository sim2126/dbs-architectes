/** Creates the project and its activity atomically after route authorisation. */
import { Prisma } from "@prisma/client";
import { prisma } from "@/platform/db";
import { DEFAULT_PROJECT_PHASE, normaliseProjectPhase } from "../domain/phase-helpers";
import { nextProjectCode } from "../domain/next-project-code";
import {
  parseProjectCoordinate, parseProjectDate, parseProjectYear, ProjectInputError,
  validateProjectDateRange, validateProjectValues,
} from "../domain/project-input";

export type CreateProjectInput = {
  actorUserId: string;
  data: {
    code?: string;
    title: string;
    category?: string;
    phase?: string;
    workStatus?: string;
    client?: string | null;
    year?: number | string | null;
    commune?: string | null;
    typology?: string | null;
    terrain?: string | null;
    roof?: string | null;
    description?: string | null;
    notes?: string | null;
    billing?: string | null;
    pageLink?: string | null;
    image?: string | null;
    country?: string | null;
    operatingRegion?: string | null;
    regionCode?: string | null;
    address?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
    startDate?: string | Date | null;
    endDate?: string | Date | null;
  };
};

export async function createProject({ actorUserId, data }: CreateProjectInput) {
  validateProjectValues(data, true);
  const startDate = data.startDate === undefined ? null : parseProjectDate(data.startDate, "Start date");
  const endDate = data.endDate === undefined ? null : parseProjectDate(data.endDate, "End date");
  validateProjectDateRange(startDate, endDate);
  const year = data.year === undefined ? null : parseProjectYear(data.year);
  const latitude = data.latitude === undefined ? null : parseProjectCoordinate(data.latitude, "latitude");
  const longitude = data.longitude === undefined ? null : parseProjectCoordinate(data.longitude, "longitude");

  try {
    return await prisma.$transaction(async (tx) => {
      // All creators, including callers supplying a code, share this lock.
      // Allocation and insertion therefore cannot race across app instances.
      await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${"project-code"}, 0))`);
      let code = data.code?.trim();
      if (!code) {
        const codeYear = new Date().getFullYear();
        const taken = await tx.project.findMany({
          where: { code: { startsWith: `DBS-${codeYear}-` } },
          select: { code: true },
        });
        code = nextProjectCode(codeYear, taken.map((project) => project.code));
      }
      const project = await tx.project.create({
        data: {
          code,
          title: data.title.trim(),
          category: data.category || "Residenziale",
          phase: data.phase?.trim() ? normaliseProjectPhase(data.phase) : DEFAULT_PROJECT_PHASE,
          workStatus: data.workStatus ?? "todo",
          client: data.client || null,
          year,
          commune: data.commune || null,
          typology: data.typology || null,
          terrain: data.terrain || null,
          roof: data.roof || null,
          description: data.description || null,
          notes: data.notes || null,
          billing: data.billing || null,
          pageLink: data.pageLink || null,
          image: data.image || null,
          country: data.country || null,
          operatingRegion: data.operatingRegion || null,
          regionCode: data.regionCode || null,
          address: data.address || null,
          latitude,
          longitude,
          startDate,
          endDate,
        },
        include: {
          assignments: { include: { user: { select: { id: true, name: true, initials: true } } } },
        },
      });
      await tx.activity.create({
        data: {
          type: "created",
          description: `Progetto "${project.title}" creato`,
          projectId: project.id,
          userId: actorUserId,
        },
      });
      return project;
    }, { maxWait: 10_000, timeout: 10_000 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ProjectInputError("A project with this code already exists.", 409);
    }
    throw error;
  }
}
