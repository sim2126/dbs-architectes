"use client";

import { Bell, Moon, Sun, Search, CheckCheck, Command } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/translations";

interface Activity {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { name?: string | null; initials?: string | null } | null;
  project: { title: string; code: string } | null;
}

const TYPE_COLORS: Record<string, string> = {
  PROJECT_CREATED: "#22c55e",
  PROJECT_UPDATED: "#3b82f6",
  PROJECT_DELETED: "#ef4444",
  USER_JOINED: "#8b5cf6",
  USER_UPDATED: "#6366f1",
  FILE_UPLOADED: "#f59e0b",
};

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const t = useT();
  const [darkMode, setDarkMode] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const notifRef = useRef<HTMLDivElement>(null);

  // Restore dark mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("dbs-dark-mode");
    if (saved === "true") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("dbs-dark-mode", String(next));
  };

  const openSearch = () => {
    (window as typeof window & { openCommandPalette?: () => void }).openCommandPalette?.();
  };

  useEffect(() => {
    if (notifOpen && activities.length === 0) {
      setLoading(true);
      fetch("/api/activity?limit=15")
        .then((r) => r.json())
        .then((data) => { if (data.activities) setActivities(data.activities); })
        .finally(() => setLoading(false));
    }
  }, [notifOpen, activities.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = activities.filter((a) => !readIds.has(a.id)).length;

  return (
    <header className="h-14 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30 flex items-center justify-between px-4 gap-3">
      {title && (
        <h1 className="text-base font-semibold text-foreground shrink-0">{title}</h1>
      )}

      {/* Search bar — center piece of the header */}
      <button
        onClick={openSearch}
        className="flex-1 max-w-xs flex items-center gap-2.5 h-9 px-3 rounded-xl border border-border bg-muted/40 hover:bg-muted/80 hover:border-foreground/20 text-muted-foreground text-sm transition-all group"
      >
        <Search className="w-3.5 h-3.5 shrink-0 group-hover:text-foreground transition-colors" />
        <span className="flex-1 text-left text-sm truncate">{t("common.search")} pages, projects…</span>
        <div className="hidden sm:flex items-center gap-0.5 shrink-0">
          <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border border-border rounded">
            ⌘K
          </kbd>
        </div>
      </button>

      <div className="flex items-center gap-1 shrink-0">
        {/* Language switcher */}
        <LanguageSwitcher />

        {/* Dark mode */}
        <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="h-8 w-8">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notification Bell */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setNotifOpen(!notifOpen)}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>

          <AnimatePresence>
            {notifOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute right-0 top-10 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden z-50"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold">{t("notif.title")}</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={() => setReadIds(new Set(activities.map((a) => a.id)))}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3 h-3" />
                      {t("common.mark_read")}
                    </button>
                  )}
                </div>

                <div className="max-h-[360px] overflow-y-auto">
                  {loading ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                  ) : activities.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">{t("notif.empty")}</div>
                  ) : (
                    activities.map((activity) => {
                      const isUnread = !readIds.has(activity.id);
                      const color = TYPE_COLORS[activity.type] || "#94a3b8";
                      return (
                        <div
                          key={activity.id}
                          onClick={() => setReadIds((r) => new Set([...r, activity.id]))}
                          className="flex gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors border-b border-border/50 last:border-0"
                        >
                          <div className="mt-0.5 relative flex-shrink-0">
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                              style={{ background: color }}
                            >
                              {activity.user?.initials || activity.user?.name?.slice(0, 2).toUpperCase() || "?"}
                            </div>
                            {isUnread && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full border border-card" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium leading-snug">{activity.description}</p>
                            {activity.project && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{activity.project.code}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-border bg-muted/30">
                  <a
                    href="/dashboard/activity"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setNotifOpen(false)}
                  >
                    {t("notif.view_all")}
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
