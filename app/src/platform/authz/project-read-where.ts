import type { Prisma } from "@prisma/client";
import { authorize, readableProjectRegions, type Subject } from "./authorize";

/** Query-time equivalent of project:read, including denials and guests. */
export function projectReadWhere(subject: Subject): Prisma.ProjectWhereInput {
  if (!authorize(subject, "project:read", { kind: "project", id: "__scope__", country: null }).allow) {
    return { id: { in: [] } };
  }
  const regions = readableProjectRegions(subject);
  if (regions === null) return {};
  return {
    OR: [
      { country: null },
      { country: "" },
      ...regions.map((region) => ({
        country: region.country,
        ...(region.operatingRegion ? { operatingRegion: region.operatingRegion } : {}),
      })),
    ],
  };
}
