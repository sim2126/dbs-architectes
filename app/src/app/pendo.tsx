"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

export function PendoInitializer() {
  const { data: session, status } = useSession();
  const initialized = useRef(false);
  const identifiedUserId = useRef<string | null>(null);

  // Boot the SDK exactly once with an anonymous visitor.
  useEffect(() => {
    if (initialized.current) return;
    if (typeof pendo === "undefined") return;
    initialized.current = true;
    pendo.initialize({ visitor: { id: "" } });
  }, []);

  // When the session becomes available, identify the signed-in user.
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (typeof pendo === "undefined") return;
    if (identifiedUserId.current === session.user.id) return;
    identifiedUserId.current = session.user.id;

    pendo.identify({
      visitor: {
        id: session.user.id,
        email: session.user.email,
        full_name: session.user.name ?? undefined,
        role: session.user.role,
        employmentStatus: session.user.employmentStatus,
        defaultCountry: session.user.defaultCountry ?? undefined,
        defaultRegion: session.user.defaultRegion ?? undefined,
      },
    });
  }, [status, session]);

  return null;
}
