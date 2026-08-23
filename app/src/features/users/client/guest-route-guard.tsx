"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export function GuestRouteGuard({
  children,
  isExternal,
}: {
  children: React.ReactNode;
  isExternal: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed =
    pathname === "/dashboard/chat" ||
    pathname.startsWith("/dashboard/chat/");

  useEffect(() => {
    if (isExternal && !allowed) router.replace("/dashboard/chat");
  }, [allowed, isExternal, router]);

  if (isExternal && !allowed) return null;
  return children;
}
