import { redirect } from "next/navigation";
import { requirePermission, PermissionError, type Subject } from "@/platform/authz";
import { TeamWorkloadClient } from "@/features/team-workload";
import { loadTeamWorkload } from "@/features/team-workload/server/load-team-workload";

export default async function TeamWorkloadPage() {
  let subject: Subject;
  try {
    ({ subject } = await requirePermission(null, "team:workload.read", {
      context: { route: "/dashboard/team-workload" },
    }));
  } catch (error) {
    if (error instanceof PermissionError) {
      redirect(error.status === 401 ? "/login" : "/dashboard");
    }
    throw error;
  }

  const data = await loadTeamWorkload(subject);
  return <TeamWorkloadClient data={data} />;
}
