// Friday sidebar — primary nav + starred projects + collaboration +
// AI workflow, with a user footer pinned to the bottom. Active state is
// derived from the current route via `usePathname` mapped to nav keys.
//
// Density / aiOn / rtl are intentionally hardcoded for now — they were
// dev-time toggles in the Claude Design prototype. Promote to user
// preferences when there is real demand.

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { I } from "@/components/friday/icons";
import { Avatar } from "@/components/friday/avatar";
import { StatusDot } from "@/components/friday/status-dot";
import { cn } from "@/lib/utils";

// ─── Route ↔ nav key map ──────────────────────────────────────────
const NAV_TO_HREF: Record<string, string> = {
  dashboard: "/dashboard",
  projects: "/dashboard/projects",
  tasks: "/dashboard/tasks",
  agenda: "/dashboard/agenda",
  statistics: "/dashboard/statistics",
  chat: "/dashboard/chat",
  activity: "/dashboard/activity",
  users: "/dashboard/users",
  workbook: "/dashboard/sheets",
  integrations: "/dashboard/integrations",
  "ai-chat": "/dashboard/ai/gpt",
  "ai-saved": "/dashboard/ai/saved",
  "ai-gallery": "/dashboard/ai/gallery",
  "ai-plan": "/dashboard/ai/planning",
  settings: "/dashboard/settings",
};

function navKeyFromPath(pathname: string): string {
  if (pathname === "/dashboard") return "dashboard";
  if (pathname.startsWith("/dashboard/projects")) return "projects";
  if (pathname.startsWith("/dashboard/tasks")) return "tasks";
  if (pathname.startsWith("/dashboard/agenda")) return "agenda";
  if (pathname.startsWith("/dashboard/statistics")) return "statistics";
  if (pathname.startsWith("/dashboard/chat")) return "chat";
  if (pathname.startsWith("/dashboard/activity")) return "activity";
  if (pathname.startsWith("/dashboard/users")) return "users";
  if (pathname.startsWith("/dashboard/sheets")) return "workbook";
  if (pathname.startsWith("/dashboard/integrations")) return "integrations";
  if (pathname.startsWith("/dashboard/ai/gpt")) return "ai-chat";
  if (pathname.startsWith("/dashboard/ai/saved")) return "ai-saved";
  if (pathname.startsWith("/dashboard/ai/gallery")) return "ai-gallery";
  if (pathname.startsWith("/dashboard/ai/planning")) return "ai-plan";
  if (pathname.startsWith("/dashboard/settings")) return "settings";
  return "";
}

// ─── Wordmark ─────────────────────────────────────────────────────
function LogoMark() {
  return (
    <span
      className="inline-flex items-center justify-center font-display italic font-medium text-friday-fg"
      style={{
        width: 22,
        height: 22,
        fontSize: 24,
        lineHeight: 0.85,
        letterSpacing: -1,
        paddingBottom: 1,
      }}
      aria-hidden="true"
    >
      d
    </span>
  );
}

function Wordmark() {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-sans font-medium text-[12.5px] tracking-wide text-friday-fg">
        DBS
      </span>
      <span className="text-friday-fg-subtle text-[10.5px]">·</span>
      <span className="font-display italic font-medium text-[14.5px] text-friday-fg">
        Friday
      </span>
    </span>
  );
}

// ─── Section header ───────────────────────────────────────────────
function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 pt-3.5 pb-1.5 text-[9.5px] uppercase tracking-[0.18em] text-friday-fg-subtle font-semibold">
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-friday-border-soft mx-4 my-1.5" />;
}

// ─── Nav row ──────────────────────────────────────────────────────
interface NavItem {
  key: string;
  label: string;
  Icon: React.FC<{ size?: number; color?: string; className?: string }>;
  count?: number;
}

function NavRow({ item, active }: { item: NavItem; active: boolean }) {
  const href = NAV_TO_HREF[item.key] ?? "/dashboard";
  const Icon = item.Icon;
  return (
    <Link
      href={href}
      className={cn(
        "relative flex items-center gap-2.5 h-[30px] w-full rounded px-2.5 transition-colors duration-150 outline-none",
        "focus-visible:ring-2 focus-visible:ring-friday-accent-ring focus-visible:ring-offset-2 focus-visible:ring-offset-friday-bg",
        active
          ? "bg-friday-surface-2"
          : "hover:bg-friday-surface-2",
      )}
    >
      {active ? (
        <span className="absolute -left-2.5 top-1 bottom-1 w-0.5 bg-friday-accent" />
      ) : null}
      <Icon
        size={14}
        className={cn(
          active ? "text-friday-accent" : "text-friday-fg-muted",
        )}
      />
      <span
        className={cn(
          "flex-1 text-[12.5px] leading-[18px] -tracking-[0.05px]",
          active
            ? "text-friday-accent font-medium"
            : "text-friday-fg-muted",
        )}
      >
        {item.label}
      </span>
      {item.count != null ? (
        <span
          className={cn(
            "font-mono text-[10px] px-1.5 py-px rounded-sm leading-tight border",
            active
              ? "text-friday-accent border-friday-accent/25"
              : "text-friday-fg-subtle border-friday-border-soft",
          )}
        >
          {item.count}
        </span>
      ) : null}
    </Link>
  );
}

// ─── Starred row ──────────────────────────────────────────────────
export interface StarredProject {
  code: string;
  name: string;
  status?: string | null;
  href?: string;
}

function StarredRow({ p }: { p: StarredProject }) {
  return (
    <Link
      href={p.href ?? `/dashboard/projects/${p.code}`}
      className="flex items-center gap-2.5 px-5 py-1.5 w-full hover:bg-friday-surface-2 transition-colors duration-150"
    >
      <StatusDot status={p.status} size={5} />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-display italic font-medium text-[13.5px] leading-[18px] text-friday-fg whitespace-nowrap overflow-hidden text-ellipsis">
          {p.name}
        </span>
        <span className="font-mono text-[10.5px] text-friday-fg-subtle tracking-wide leading-snug">
          {p.code}
        </span>
      </div>
    </Link>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────
export interface SidebarUser {
  name: string;
  role: string;
  initials: string;
  imageUrl?: string | null;
}

interface SidebarProps {
  starred: StarredProject[];
  user: SidebarUser;
  tasksCount?: number;
  chatUnread?: number;
}

const NAV_CORE: NavItem[] = [
  { key: "dashboard", label: "Dashboard", Icon: I.Home },
  { key: "projects", label: "Projects", Icon: I.Folder },
  { key: "tasks", label: "Tasks", Icon: I.Check },
  { key: "agenda", label: "Agenda", Icon: I.Calendar },
  { key: "statistics", label: "Statistics", Icon: I.Chart },
];

const NAV_COLLAB: NavItem[] = [
  { key: "chat", label: "Chat", Icon: I.Chat },
  { key: "activity", label: "My Activity", Icon: I.Activity },
  { key: "users", label: "Users", Icon: I.Users },
  { key: "workbook", label: "WorkBook", Icon: I.Book },
  { key: "integrations", label: "Integrations", Icon: I.Plug },
];

const NAV_AI: NavItem[] = [
  { key: "ai-chat", label: "DBS GPT", Icon: I.Sparkle },
  { key: "ai-saved", label: "Saved Insights", Icon: I.Star },
  { key: "ai-gallery", label: "Visual Gallery", Icon: I.Image },
  { key: "ai-plan", label: "Planning AI", Icon: I.Brain },
];

export function FridaySidebar({
  starred,
  user,
  tasksCount,
  chatUnread,
}: SidebarProps) {
  const pathname = usePathname() ?? "";
  const active = navKeyFromPath(pathname);
  const router = useRouter();

  const core = NAV_CORE.map((it) =>
    it.key === "tasks" ? { ...it, count: tasksCount } : it,
  );
  const collab = NAV_COLLAB.map((it) =>
    it.key === "chat" ? { ...it, count: chatUnread } : it,
  );

  return (
    <aside className="w-[240px] h-full bg-friday-bg flex flex-col shrink-0 border-r border-friday-border-soft">
      <div className="px-5 py-4 flex items-center gap-2.5 border-b border-friday-border-soft">
        <LogoMark />
        <Wordmark />
      </div>

      <div className="px-2.5 py-1.5">
        {core.map((it) => (
          <NavRow key={it.key} item={it} active={active === it.key} />
        ))}
      </div>

      {starred.length > 0 ? (
        <>
          <Divider />
          <SectionHeader>Starred</SectionHeader>
          <div className="pb-1">
            {starred.map((p) => (
              <StarredRow key={p.code} p={p} />
            ))}
          </div>
        </>
      ) : null}

      <Divider />
      <SectionHeader>Collaboration</SectionHeader>
      <div className="px-2.5 pb-1">
        {collab.map((it) => (
          <NavRow key={it.key} item={it} active={active === it.key} />
        ))}
      </div>

      <Divider />
      <SectionHeader>AI Workflow</SectionHeader>
      <div className="px-2.5 pb-1">
        {NAV_AI.map((it) => (
          <NavRow key={it.key} item={it} active={active === it.key} />
        ))}
      </div>

      <div className="flex-1" />

      <div className="px-3.5 py-2.5 flex items-center gap-2.5 border-t border-friday-border-soft">
        <Avatar initials={user.initials} size={28} imageUrl={user.imageUrl} />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[11.5px] text-friday-fg font-medium truncate">
            {user.name}
          </span>
          <span className="text-[10px] text-friday-fg-muted truncate">
            {user.role}
          </span>
        </div>
        <button
          type="button"
          aria-label="Settings"
          onClick={() => router.push("/dashboard/settings")}
          className="bg-transparent border-0 p-1 cursor-pointer text-friday-fg-muted hover:text-friday-fg leading-none rounded-sm"
        >
          <I.Settings size={13} />
        </button>
        <button
          type="button"
          aria-label="Sign out"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="bg-transparent border-0 p-1 cursor-pointer text-friday-fg-muted hover:text-friday-fg leading-none rounded-sm"
        >
          <I.Logout size={13} />
        </button>
      </div>
    </aside>
  );
}
