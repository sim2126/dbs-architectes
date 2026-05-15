import { redirect } from "next/navigation";
import { auth } from "@/platform/auth";
import { isManagerOrAbove } from "@/platform/authz/permissions";
import { TeamWorkloadClient } from "@/features/team-workload";
import { loadTeamWorkload } from "@/features/team-workload/server/load-team-workload";

export default async function TeamWorkloadPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isManagerOrAbove(session.user.role)) redirect("/dashboard");

  const data = await loadTeamWorkload();
  return <TeamWorkloadClient data={data} />;
}
