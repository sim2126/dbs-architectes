import { redirect, notFound } from "next/navigation";
import {
  authorize,
  loadProjectForAuth,
  logAuthorizationDecision,
  loadSubject,
} from "@/platform/authz";
import { isAdmin } from "@/platform/authz/permissions";
import { ProjectDetail } from "@/features/projects";
import { loadProjectDetail } from "@/features/projects/server/load-project-detail";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const subject = await loadSubject();
  if (!subject) redirect("/login");
  if (subject.isExternal) redirect("/dashboard/chat");
  const { id } = await params;

  // Resolve the project + caller's assignment for the auth decision.
  const resource = await loadProjectForAuth(id, subject.userId);
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
  const statusPostDecision = authorize(subject, "project:status.post", resource);

  // Load the full detail payload via the feature's server function.
  const data = await loadProjectDetail({
    projectId: id,
    currentUserId: subject.userId,
    isAdmin: isAdmin(subject.role),
    canReadThread: authorize(subject, "thread:read", resource).allow,
    canAssignMembers: assignDecision.allow,
    canPostStatus: statusPostDecision.allow,
  });
  if (!data) notFound();

  return <ProjectDetail data={data} />;
}
