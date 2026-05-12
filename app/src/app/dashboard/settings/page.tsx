import { redirect } from "next/navigation";
import { auth } from "@/platform/auth";
import { isAdmin } from "@/platform/authz/permissions";
import { SettingsClient } from "@/features/settings";

export default async function SettingsPage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <SettingsClient
      isAdmin={isAdmin(session.user.role)}
      currentUserId={session.user.id}
    />
  );
}
