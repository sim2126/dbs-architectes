"use client";

import { useState } from "react";
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
  Settings,
  LogOut,
  Sparkles,
  Building2,
  MessageSquare,
  Video,
  Activity,
  BookUser,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { cn } from "@/shared/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: FolderOpen,
  },
  {
    label: "Agenda",
    href: "/dashboard/agenda",
    icon: Calendar,
  },
  {
    label: "Statistics",
    href: "/dashboard/statistics",
    icon: BarChart3,
  },
  {
    label: "Users",
    href: "/dashboard/users",
    icon: Users,
    adminOnly: true,
  },
];

const collaborationItems = [
  {
    label: "Chat",
    href: "/dashboard/chat",
    icon: MessageSquare,
  },
  {
    label: "Calls",
    href: "/dashboard/calls",
    icon: Video,
  },
  {
    label: "Contacts",
    href: "/dashboard/contact",
    icon: BookUser,
  },
  {
    label: "Activity",
    href: "/dashboard/activity",
    icon: Activity,
  },
];

const aiItems = [
  {
    label: "DBS GPT",
    href: "/dashboard/ai/gpt",
    icon: Sparkles,
  },
  {
    label: "Visual Gallery AI",
    href: "/dashboard/ai/gallery",
    icon: Image,
  },
  {
    label: "Planning AI",
    href: "/dashboard/ai/planning",
    icon: FileSearch,
  },
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
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  const isAdmin = user?.role === "super_admin" || user?.role === "admin";
  const initials = user?.name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "DB";

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="relative flex flex-col h-screen bg-card border-r border-border overflow-hidden shrink-0"
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 bg-foreground rounded-lg shrink-0">
            <span className="text-background font-bold text-sm">[</span>
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex flex-col min-w-0"
              >
                <span className="text-sm font-bold leading-none">DBS</span>
                <span className="text-xs text-muted-foreground leading-none mt-0.5">
                  Architectes
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="truncate"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            );
          })}
        </div>

        {/* Collaboration Section */}
        <div className="pt-4">
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 mb-2"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3 h-3" />
                  Collaboration
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="space-y-0.5">
            {collaborationItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="truncate"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </div>
        </div>

        {/* AI Section */}
        <div className="pt-4">
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 mb-2"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Brain className="w-3 h-3" />
                  AI Workflow
                </span>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="space-y-0.5">
            {aiItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                    isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  <AnimatePresence>
                    {!collapsed && (
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="truncate"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* User section */}
      <div className="px-3 py-3 border-t border-border">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={user?.image || ""} />
            <AvatarFallback className="bg-foreground text-background text-xs">
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
                <p className="text-sm font-medium truncate">{user?.name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate capitalize">
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
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 z-10 flex items-center justify-center w-6 h-6 bg-background border border-border rounded-full shadow-sm hover:bg-accent transition-colors"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </motion.aside>
  );
}
