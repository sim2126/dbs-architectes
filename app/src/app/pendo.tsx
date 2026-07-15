"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";

interface MeResponse {
  initials: string | null;
  mfaEnabledAt: string | null;
}

export function PendoInitializer() {
  const { data: session, status } = useSession();
  const initializedRef = useRef(false);
  const identifiedRef = useRef<string | null>(null);

  // Boot the SDK exactly once with an anonymous visitor.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    pendo.initialize({ visitor: { id: "" } });
  }, []);

  // Identify the user when the session becomes available.
  useEffect(() => {
    if (status === "unauthenticated") {
      identifiedRef.current = null;
      return;
    }

    if (status !== "authenticated" || !session?.user?.id) return;
    if (identifiedRef.current === session.user.id) return;
    identifiedRef.current = session.user.id;

    const { user } = session;

    fetch("/api/users/me")
      .then((res) => (res.ok ? (res.json() as Promise<MeResponse>) : null))
      .then((profile) => {
        pendo.identify({
          visitor: {
            id: user.id,
            email: user.email,
            full_name: user.name,
            role: user.role,
            employmentStatus: user.employmentStatus,
            defaultCountry: user.defaultCountry,
            defaultRegion: user.defaultRegion,
            initials: profile?.initials,
            mfaEnabledAt: profile?.mfaEnabledAt,
          },
        });
      })
      .catch(() => {
        pendo.identify({
          visitor: {
            id: user.id,
            email: user.email,
            full_name: user.name,
            role: user.role,
            employmentStatus: user.employmentStatus,
            defaultCountry: user.defaultCountry,
            defaultRegion: user.defaultRegion,
          },
        });
      });
  }, [status, session]);

  return null;
}
