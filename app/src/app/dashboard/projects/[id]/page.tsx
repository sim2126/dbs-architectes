import { redirect, notFound } from "next/navigation";
import { auth } from "@/platform/auth";
import { prisma } from "@/platform/db";
import {
  authorize,
  loadProjectForAuth,
  logAuthorizationDecision,
  type Subject,
} from "@/platform/authz";
import { isAdmin } from "@/platform/authz/permissions";
import { ProjectDetail } from "@/features/projects";
import { loadProjectDetail } from "@/features/projects/server/load-project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const { id } = await params;

  // Build the AuthZ subject + region access.
  const regions = await prisma.userRegionAccess.findMany({
    where: { userId: session.user.id },
    select: { country: true, operatingRegion: true, accessLevel: true },
  });
  const subject: Subject = {
    userId: session.user.id,
    role: session.user.role,
    regions: regions.map((r) => ({
      country: r.country,
      operatingRegion: r.operatingRegion,
      accessLevel: r.accessLevel as "view" | "manage",
    })),
  };

  // Resolve the project + caller's assignment for the auth decision.
  const resource = await loadProjectForAuth(id, session.user.id);
  if (!resource) notFound();
  const decision = authorize(subject, "project:read", resource);
  await logAuthorizationDecision({
    subject,
    action: "project:read",
    resource,
    decision,
    context: { route: `GET /dashboard/projects/${id}` },
  });
  if (!decision.allow) {
    // 403 is surfaced as a clean redirect — we don't leak the existence
    // of a project a viewer can't see.
    redirect("/dashboard/projects");
  }

  // Membership management is gated by `project:assign` — directors and the
  // project's own leads can add/remove members. We compute the decision
  // here so the server payload tells the client exactly what to render
  // instead of letting the client guess from `isAdmin`.
  const assignDecision = authorize(subject, "project:assign", resource);

  // Load the full detail payload via the feature's server function.
  const data = await loadProjectDetail({
    projectId: id,
    currentUserId: session.user.id,
    isAdmin: isAdmin(session.user.role),
    canAssignMembers: assignDecision.allow,
  });
  if (!data) notFound();

  return <ProjectDetail data={data} />;
}
