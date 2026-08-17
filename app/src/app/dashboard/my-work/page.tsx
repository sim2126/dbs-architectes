import { redirect } from "next/navigation";
import { auth } from "@/platform/auth";
import { MyWork } from "@/features/work-items/client/my-work";
import { loadMyWork } from "@/features/work-items/server/load-my-work";

export default async function MyWorkPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Self-scoped by construction — loadMyWork filters on this userId, so
  // there is no authorization branch to get wrong.
  const data = await loadMyWork(session.user.id);

  return (
    <MyWork
      buckets={data.buckets}
      openCount={data.openCount}
      userName={session.user.name ?? session.user.email ?? "there"}
    />
  );
}
