import { redirect } from "next/navigation";
import { auth } from "@/platform/auth";
import { isAdmin } from "@/platform/authz/permissions";
import { SettingsClient } from "@/features/settings";

export default async function SettingsPage() {
  const session = await auth({ allowExternal: true });
  if (!session) redirect("/login");
  if (session.user.isExternal) redirect("/dashboard/chat");

  return <SettingsClient isAdmin={isAdmin(session.user.role)} />;
}
