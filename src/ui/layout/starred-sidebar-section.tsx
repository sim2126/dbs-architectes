"use client";

// Sidebar section that lists the user's starred entities. Subscribes to
// the `favorites:changed` window event so toggles anywhere in the app
// refresh the list without prop-drilling.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Bookmark, FolderOpen, Calendar, Table2, MessageSquare, User, Star } from "lucide-react";
import { cn } from "@/ui/utils";
import { useFavoritesChanged } from "@/ui/components/favorite-star";

type EntityType = "project" | "sheet" | "agenda" | "user" | "ai_chat";

interface FavoritesPayload {
  favorites: Array<{ id: string; entityType: EntityType; entityId: string; createdAt: string }>;
  entities: {
    projects: Array<{ id: string; code: string; title: string }>;
    sheets: Array<{ id: string; name: string }>;
    agenda: Array<{ id: string; title: string; date: string }>;
    users: Array<{ id: string; name: string | null; initials: string | null }>;
    aiChats: Array<{ id: string; title: string }>;
  };
}

const ICON: Record<EntityType, typeof FolderOpen> = {
  project: FolderOpen,
  sheet: Table2,
  agenda: Calendar,
  ai_chat: MessageSquare,
  user: User,
};

const HREF: Record<EntityType, (id: string) => string> = {
  project: (id) => `/dashboard/projects/${id}`,
  sheet: (id) => `/dashboard/sheets?sheet=${id}`,
  agenda: () => `/dashboard/agenda`,
  ai_chat: () => `/dashboard/ai/gpt`,
  user: () => `/dashboard/users`,
};

export function StarredSidebarSection({ collapsed }: { collapsed: boolean }) {
  const [data, setData] = useState<FavoritesPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/favorites?expand=1");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as FavoritesPayload;
      setData(json);
    } catch (err) {
      console.error("[starred-section] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFavoritesChanged(fetchData);

  // Hide the section entirely if user has no favourites and isn't loading.
  if (!loading && (!data || data.favorites.length === 0)) {
    return null;
  }

  const items = (data?.favorites ?? [])
    .map((fav) => {
      const e = data?.entities;
      if (!e) return null;
      switch (fav.entityType) {
        case "project": {
          const p = e.projects.find((x) => x.id === fav.entityId);
          if (!p) return null;
          return { type: fav.entityType, id: fav.entityId, label: `[${p.code}] ${p.title}` };
        }
        case "sheet": {
          const s = e.sheets.find((x) => x.id === fav.entityId);
          if (!s) return null;
          return { type: fav.entityType, id: fav.entityId, label: s.name };
        }
        case "agenda": {
          const a = e.agenda.find((x) => x.id === fav.entityId);
          if (!a) return null;
          return { type: fav.entityType, id: fav.entityId, label: a.title };
        }
        case "user": {
          const u = e.users.find((x) => x.id === fav.entityId);
          if (!u) return null;
          return { type: fav.entityType, id: fav.entityId, label: u.name ?? "Unknown" };
        }
        case "ai_chat": {
          const c = e.aiChats.find((x) => x.id === fav.entityId);
          if (!c) return null;
          return { type: fav.entityType, id: fav.entityId, label: c.title };
        }
      }
    })
    .filter((x): x is { type: EntityType; id: string; label: string } => Boolean(x))
    .slice(0, 12);

  if (items.length === 0) return null;

  return (
    <div>
      <AnimatePresence>
        {!collapsed && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60"
          >
            Starred
          </motion.p>
        )}
      </AnimatePresence>
      {collapsed && <div className="my-1 mx-2 h-px bg-border/60" />}
      <div className="space-y-0.5">
        {items.map((item) => {
          const Icon = ICON[item.type];
          const href = HREF[item.type](item.id);
          return (
            <Link
              key={`${item.type}:${item.id}`}
              href={href}
              className={cn(
                "group flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-accent hover:text-foreground",
                collapsed && "justify-center",
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="truncate"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
              {!collapsed && (
                <Star className="ml-auto h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// Re-export the bookmark icon so the sidebar can import everything from here
// if it wants to.
export { Bookmark };
