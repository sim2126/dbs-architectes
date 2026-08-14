import { redirect } from "next/navigation";
import { ALL_ACTIONS, GRANTABLE_ACTIONS, authorize, loadSubject } from "@/platform/authz";
import { PermissionsManager } from "@/features/permissions";
import { loadPermissionGrants } from "@/features/permissions/server/load-permission-grants";

export default async function PermissionsSettingsPage() {
  const subject = await loadSubject();
  if (!subject) redirect("/login");

  // Server-side gate. The API enforces this independently — a page guard is
  // not authorization, it only avoids rendering a surface the caller cannot use.
  if (!authorize(subject, "settings:permissions.read", null).allow) {
    redirect("/dashboard/settings");
  }

  const subjects = await loadPermissionGrants();

  return (
    <div className="px-6 py-8 sm:px-8 max-w-4xl">
      <PermissionsManager
        subjects={subjects}
        grantableActions={GRANTABLE_ACTIONS}
        allActions={ALL_ACTIONS}
      />
    </div>
  );
}
