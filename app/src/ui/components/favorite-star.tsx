"use client";

// Reusable star toggle for any DBS entity.
// Usage: <FavoriteStar entityType="project" entityId={p.id} />
//
// Optimistic update + idempotent server toggle. Emits a window event
// `favorites:changed` so the sidebar Starred section can refetch
// without prop-drilling.

import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/ui/utils";

export type FavoriteEntityType =
  | "project"
  | "sheet"
  | "agenda"
  | "user"
  | "ai_chat";

const FAVORITE_CHANGED_EVENT = "favorites:changed";

export function emitFavoritesChanged() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(FAVORITE_CHANGED_EVENT));
  }
}

export function useFavoritesChanged(handler: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.addEventListener(FAVORITE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(FAVORITE_CHANGED_EVENT, handler);
  }, [handler]);
}

export function FavoriteStar({
  entityType,
  entityId,
  initiallyStarred,
  size = 14,
  className,
  stopPropagation = true,
}: {
  entityType: FavoriteEntityType;
  entityId: string;
  initiallyStarred?: boolean;
  size?: number;
  className?: string;
  stopPropagation?: boolean;
}) {
  const [starred, setStarred] = useState(Boolean(initiallyStarred));
  const [busy, setBusy] = useState(false);

  // Sync prop -> state when entity changes (list re-render, paging, etc.)
  useEffect(() => {
    setStarred(Boolean(initiallyStarred));
  }, [initiallyStarred, entityId]);

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      if (stopPropagation) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (busy) return;
      setBusy(true);
      const next = !starred;
      setStarred(next); // optimistic

      try {
        if (next) {
          const res = await fetch("/api/favorites", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityType, entityId }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        } else {
          const params = new URLSearchParams({ entityType, entityId });
          const res = await fetch(`/api/favorites?${params}`, { method: "DELETE" });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        }
        emitFavoritesChanged();
      } catch (err) {
        console.error("[favorite-star] toggle failed:", err);
        setStarred((s) => !s); // rollback
      } finally {
        setBusy(false);
      }
    },
    [busy, starred, entityType, entityId, stopPropagation],
  );

  return (
    <button
      onClick={toggle}
      disabled={busy}
      title={starred ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={starred}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1 transition-all",
        starred
          ? "text-amber-500 hover:text-amber-600"
          : "text-muted-foreground/60 hover:text-amber-500 hover:bg-muted",
        busy && "opacity-50",
        className,
      )}
    >
      <Star
        size={size}
        className={cn("transition-transform", starred ? "fill-current scale-110" : "scale-100")}
        strokeWidth={1.75}
      />
    </button>
  );
}
