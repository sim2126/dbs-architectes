// Friday top bar — small route label on the left, ⌘K search trigger
// in the middle, language switcher + notifications + avatar on the
// right. The route label is uppercase tracked, derived from pathname.
//
// Per-page rich breadcrumbs (e.g., "Projects / Le Saillen / DBS-2025-001")
// are a screen-level concern, not the topbar's. Each screen renders its
// own breadcrumb in the page content area where it has the data.

"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { I } from "@/components/friday/icons";
import { Avatar } from "@/components/friday/avatar";
import { cn } from "@/lib/utils";

const ROUTE_LABEL: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/dashboard/projects": "Projects",
  "/dashboard/tasks": "Tasks",
  "/dashboard/agenda": "Agenda",
  "/dashboard/statistics": "Statistics",
  "/dashboard/chat": "Chat",
  "/dashboard/activity": "My Activity",
  "/dashboard/users": "Users",
  "/dashboard/sheets": "WorkBook",
  "/dashboard/integrations": "Integrations",
  "/dashboard/ai/gpt": "DBS GPT",
  "/dashboard/ai/saved": "Saved Insights",
  "/dashboard/ai/gallery": "Visual Gallery",
  "/dashboard/ai/planning": "Planning AI",
  "/dashboard/settings": "Settings",
  "/dashboard/contact": "Contact",
  "/dashboard/calls": "Calls",
};

function labelFromPath(pathname: string): string {
  if (ROUTE_LABEL[pathname]) return ROUTE_LABEL[pathname];
  // Fall back to longest matching prefix.
  const sorted = Object.keys(ROUTE_LABEL).sort((a, b) => b.length - a.length);
  for (const p of sorted) {
    if (pathname.startsWith(p)) return ROUTE_LABEL[p];
  }
  return "";
}

export interface TopBarUser {
  initials: string;
  imageUrl?: string | null;
}

interface TopBarProps {
  user: TopBarUser;
  onCmdK: () => void;
  lang: "EN" | "FR" | "IT";
  onLang: (l: "EN" | "FR" | "IT") => void;
  hasUnreadNotifications?: boolean;
}

export function FridayTopBar({
  user,
  onCmdK,
  lang,
  onLang,
  hasUnreadNotifications,
}: TopBarProps) {
  const pathname = usePathname() ?? "";
  const label = labelFromPath(pathname);

  const langs: TopBarProps["lang"][] = ["EN", "FR", "IT"];

  return (
    <div className="h-13 bg-friday-bg flex items-center gap-3.5 px-5 border-b border-friday-border-soft shrink-0" style={{ height: 52 }}>
      <span className="text-[10.5px] uppercase tracking-[0.18em] text-friday-fg-muted font-semibold whitespace-nowrap">
        {label}
      </span>

      <div className="flex-1" />

      <button
        type="button"
        onClick={onCmdK}
        className={cn(
          "flex items-center gap-2 h-8 pl-3 pr-2 min-w-[280px] rounded border border-friday-border-soft hover:border-friday-border hover:bg-friday-surface transition-colors duration-150 outline-none",
          "focus-visible:ring-2 focus-visible:ring-friday-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-friday-bg",
        )}
      >
        <I.Search size={12} className="text-friday-fg-muted" />
        <span className="text-[11.5px] text-friday-fg-muted flex-1 text-left">
          Search projects, people, threads…
        </span>
        <span className="font-mono text-[9.5px] text-friday-fg-subtle border border-friday-border-soft px-1.5 rounded-sm leading-tight">
          ⌘K
        </span>
      </button>

      <div className="flex items-center font-mono text-[10px] tracking-wide">
        {langs.map((l, i) => (
          <React.Fragment key={l}>
            {i > 0 ? (
              <span className="text-friday-fg-subtle text-[9px]">·</span>
            ) : null}
            <button
              type="button"
              onClick={() => onLang(l)}
              className={cn(
                "bg-transparent border-0 px-2 py-1 cursor-pointer rounded-sm",
                lang === l
                  ? "text-friday-fg font-semibold"
                  : "text-friday-fg-subtle hover:text-friday-fg-muted",
              )}
            >
              {l}
            </button>
          </React.Fragment>
        ))}
      </div>

      <button
        type="button"
        aria-label="Notifications"
        className="relative bg-transparent border-0 p-1.5 cursor-pointer text-friday-fg-muted hover:text-friday-fg leading-none rounded-sm"
      >
        <I.Bell size={15} />
        {hasUnreadNotifications ? (
          <span
            className="absolute top-[5px] right-[5px] w-[5px] h-[5px] rounded-full bg-friday-accent"
            style={{ border: "1.5px solid var(--friday-bg)" }}
          />
        ) : null}
      </button>

      <Avatar initials={user.initials} size={26} imageUrl={user.imageUrl} />
    </div>
  );
}
