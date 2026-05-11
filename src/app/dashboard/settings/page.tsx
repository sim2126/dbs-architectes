import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { SettingsClient } from "./settings-client";

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
