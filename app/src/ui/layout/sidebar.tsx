"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  BarChart3,
  Calendar,
  Brain,
  Image,
  FileSearch,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Sparkles,
  MessageSquare,
  Activity,
  Plug,
  Table2,
  Bookmark,
  Target,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/ui/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/ui/components/avatar";
import { CommandPalette } from "@/ui/components/command-palette";
import { useT } from "@/i18n/translations";
import { useUserPrefs } from "@/ui/stores/user-prefs-store";
import { StarredSidebarSection } from "@/ui/layout/starred-sidebar-section";

const navItems = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "nav.projects", href: "/dashboard/projects", icon: FolderOpen },
  { labelKey: "nav.tasks", href: "/dashboard/tasks", icon: Target },
  { labelKey: "nav.agenda", href: "/dashboard/agenda", icon: Calendar },
  { labelKey: "nav.statistics", href: "/dashboard/statistics", icon: BarChart3 },
];

const collaborationItems = [
  { labelKey: "nav.chat", href: "/dashboard/chat", icon: MessageSquare },
  { labelKey: "nav.activity", href: "/dashboard/activity", icon: Activity },
  { labelKey: "nav.users", href: "/dashboard/users", icon: Users, adminOnly: true },
  { labelKey: "nav.sheets", href: "/dashboard/sheets", icon: Table2 },
  { labelKey: "nav.integrations", href: "/dashboard/integrations", icon: Plug },
];

const aiItems = [
  { labelKey: "nav.ai_gpt", href: "/dashboard/ai/gpt", icon: Sparkles },
  { labelKey: "nav.ai_saved", href: "/dashboard/ai/saved", icon: Bookmark },
  { labelKey: "nav.ai_gallery", href: "/dashboard/ai/gallery", icon: Image },
  { labelKey: "nav.ai_planning", href: "/dashboard/ai/planning", icon: FileSearch },
];

interface SidebarProps {
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const { sidebarCollapsed: collapsed, setSidebarCollapsed: setCollapsed } = useUserPrefs();
  const pathname = usePathname();
  const t = useT();

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "DB";

  return (
    <>
      <CommandPalette />
      {/*
       * Wrapper is relative so the collapse button can sit exactly on the
       * sidebar/content boundary without being clipped by overflow:hidden.
       */}
      <div className="relative flex shrink-0 h-full">
        <motion.aside
          animate={{ width: collapsed ? 72 : 260 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="flex flex-col h-full bg-card overflow-hidden border-r border-border shadow-[1px_0_0_0_hsl(var(--border))]"
        >
          {/* ── Logo — height matches the top header (h-14 = 56px) ── */}
          <div className="flex items-center h-14 px-4 border-b border-border shrink-0">
            <Link
              href="/dashboard"
              aria-label="DBS Friday.com"
              className="flex items-baseline gap-2 min-w-0 group"
            >
              {/* Italic "d" mark — Cormorant Garamond italic, architectural footer cue */}
              <span
                aria-hidden
                className="font-display italic text-foreground leading-none shrink-0 select-none"
                style={{ fontSize: "30px", fontWeight: 500, transform: "translateY(2px)" }}
              >
                d
              </span>

              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-baseline gap-1.5 min-w-0"
                  >
                    <span className="text-[11px] font-semibold text-foreground tracking-[0.22em] uppercase leading-none">
                      DBS
                    </span>
                    <span
                      aria-hidden
                      className="text-muted-foreground/60 leading-none"
                      style={{ fontSize: "11px" }}
                    >
                      ·
                    </span>
                    <span className="font-display italic text-foreground leading-none" style={{ fontSize: "17px", fontWeight: 500 }}>
                      Friday
                    </span>
                    <span
                      className="font-display italic text-muted-foreground/70 leading-none tracking-tight"
                      style={{ fontSize: "10px", letterSpacing: "0.01em" }}
                    >
                      .com
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          </div>

          {/* ── Navigation ── */}
          <nav className="flex-1 px-2.5 py-3 space-y-4 overflow-y-auto overflow-x-hidden">
            {/* Main items */}
            <div className="space-y-0.5">
              {navItems.map((item) => {
                const isActive = item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? t(item.labelKey) : undefined}
                    className={cn(
                      "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <AnimatePresence>
                      {!collapsed && (
                        <motion.span
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.12 }}
                          className="truncate"
                        >
                          {t(item.labelKey)}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </Link>
                );
              })}
            </div>

            {/* Starred — auto-hidden when user has nothing favourited */}
            <StarredSidebarSection collapsed={collapsed} />

            {/* Collaboration */}
            <div>
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-2.5 mb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest"
                  >
                    {t("nav.collaboration")}
                  </motion.p>
                )}
              </AnimatePresence>
              {collapsed && <div className="my-1 mx-2 h-px bg-border/60" />}
              <div className="space-y-0.5">
                {collaborationItems.map((item) => {
                  if ("adminOnly" in item && item.adminOnly && !isAdmin) return null;
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? t(item.labelKey) : undefined}
                      className={cn(
                        "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                        isActive
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12 }}
                            className="truncate"
                          >
                            {t(item.labelKey)}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* AI Workflow */}
            <div>
              <AnimatePresence>
                {!collapsed && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-2.5 mb-1 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-widest"
                  >
                    {t("nav.ai_workflow")}
                  </motion.p>
                )}
              </AnimatePresence>
              {collapsed && <div className="my-1 mx-2 h-px bg-border/60" />}
              <div className="space-y-0.5">
                {aiItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? t(item.labelKey) : undefined}
                      className={cn(
                        "flex items-center gap-3 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-150",
                        isActive
                          ? "bg-foreground text-background shadow-sm"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/70"
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.12 }}
                            className="truncate"
                          >
                            {t(item.labelKey)}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>

          {/* ── User section ── */}
          <div className="px-2.5 py-3 border-t border-border shrink-0">
            <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarImage src={user?.image || ""} />
                <AvatarFallback className="bg-foreground text-background text-[10px] font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <AnimatePresence>
                {!collapsed && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex-1 min-w-0"
                  >
                    <p className="text-xs font-semibold truncate leading-tight">{user?.name || "User"}</p>
                    <p className="text-[10px] text-muted-foreground truncate capitalize leading-tight mt-0.5">
                      {user?.role?.replace("_", " ") || "viewer"}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {!collapsed && (
                  <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                    title="Sign out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.aside>

        {/*
         * Collapse button lives OUTSIDE the aside so it's never clipped by
         * overflow:hidden. It tracks the sidebar edge via a motion.button.
         */}
        <motion.button
          animate={{ x: collapsed ? -4 : -4 }}
          onClick={() => setCollapsed(!collapsed)}
          style={{ top: 72 }}
          className="absolute right-0 translate-x-1/2 z-30 flex items-center justify-center w-6 h-6 rounded-full bg-background border border-border shadow-md hover:shadow-lg hover:bg-accent transition-all"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed
            ? <ChevronRight className="w-3 h-3 text-muted-foreground" />
            : <ChevronLeft className="w-3 h-3 text-muted-foreground" />
          }
        </motion.button>
      </div>
    </>
  );
}
