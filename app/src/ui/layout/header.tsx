"use client";

import { Bell, Moon, Sun, Search, CheckCheck, AtSign, Activity, MessageSquare } from "lucide-react";
import Link from "next/link";
import { Button } from "@/ui/components/button";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useT } from "@/i18n/translations";
import { getPusherClient } from "@/platform/integrations/pusher-client";
import { useSession } from "next-auth/react";
import { cn } from "@/ui/utils";
import { FRIDAY_TOKENS } from "@/ui/tokens";

// ─── Types ─────────────────────────────────────────────────────

interface ActivityItem {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  user: { name?: string | null; initials?: string | null } | null;
  project: { title: string; code: string } | null;
}

interface MentionItem {
  id: string;
  content: string;
  createdAt: string;
  channelId: string;
  channelName?: string;
  user: { name?: string | null; initials?: string | null } | null;
}

type TabId = "all" | "mentions" | "updates";

const ACTIVITY_COLORS: Record<string, string> = {
  PROJECT_CREATED: FRIDAY_TOKENS.activity.projectCreated,
  PROJECT_UPDATED: FRIDAY_TOKENS.activity.projectUpdated,
  PROJECT_DELETED: FRIDAY_TOKENS.activity.projectDeleted,
  USER_JOINED: FRIDAY_TOKENS.activity.userJoined,
  USER_UPDATED: FRIDAY_TOKENS.activity.userUpdated,
  FILE_UPLOADED: FRIDAY_TOKENS.activity.fileUploaded,
};

// ─── Header ────────────────────────────────────────────────────

export function Header({ title }: { title?: string }) {
  const t = useT();
  const { data: session } = useSession();
  const [darkMode, setDarkMode] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [mentions, setMentions] = useState<MentionItem[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [loadingMentions, setLoadingMentions] = useState(false);
  const [readActivityIds, setReadActivityIds] = useState<Set<string>>(new Set());
  const [readMentionIds, setReadMentionIds] = useState<Set<string>>(new Set());
  const notifRef = useRef<HTMLDivElement>(null);
  const activitiesLoaded = useRef(false);
  const mentionsLoaded = useRef(false);

  // ── Dark mode ───────────────────────────────────────────────

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

  // ── Click-outside ───────────────────────────────────────────

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ── Load activities ─────────────────────────────────────────

  const loadActivities = useCallback(async () => {
    if (activitiesLoaded.current) return;
    activitiesLoaded.current = true;
    setLoadingActivities(true);
    try {
      const res = await fetch("/api/activity?limit=20");
      const data = await res.json() as { activities: ActivityItem[] };
      if (data.activities) setActivities(data.activities);
    } finally {
      setLoadingActivities(false);
    }
  }, []);

  // ── Load mentions ───────────────────────────────────────────

  const loadMentions = useCallback(async () => {
    if (mentionsLoaded.current || !session?.user?.name) return;
    mentionsLoaded.current = true;
    setLoadingMentions(true);
    try {
      const res = await fetch(`/api/chat/messages?mention=${encodeURIComponent(session.user.name)}&limit=20`);
      if (!res.ok) throw new Error("not found");
      const data = await res.json() as MentionItem[] | { messages?: MentionItem[] };
      const items = Array.isArray(data) ? data : (data as { messages?: MentionItem[] }).messages ?? [];
      setMentions(items);
    } catch {
      // mentions endpoint may not support filter — silent fail
    } finally {
      setLoadingMentions(false);
    }
  }, [session?.user?.name]);

  // ── Open panel ──────────────────────────────────────────────

  useEffect(() => {
    if (!notifOpen) return;
    loadActivities();
    loadMentions();
  }, [notifOpen, loadActivities, loadMentions]);

  // ── Pusher real-time updates ────────────────────────────────

  useEffect(() => {
    if (!session?.user?.name) return;
    try {
      const client = getPusherClient();
      // Listen for new messages to detect mentions in real time
      const channel = client.subscribe("private-global-notifications");
      channel.bind("new-message", (data: MentionItem & { mentionedUser?: string }) => {
        if (
          session.user?.name &&
          data.content?.toLowerCase().includes(`@${session.user.name.toLowerCase()}`)
        ) {
          setMentions((prev) => [data, ...prev]);
        }
      });
      return () => {
        client.unsubscribe("private-global-notifications");
      };
    } catch {
      // Pusher unavailable — skip
    }
  }, [session?.user?.name]);

  // ── Counts ──────────────────────────────────────────────────

  const unreadActivities = activities.filter((a) => !readActivityIds.has(a.id)).length;
  const unreadMentions = mentions.filter((m) => !readMentionIds.has(m.id)).length;
  const totalUnread = unreadActivities + unreadMentions;

  const markAllRead = () => {
    setReadActivityIds(new Set(activities.map((a) => a.id)));
    setReadMentionIds(new Set(mentions.map((m) => m.id)));
  };

  // ── Tab content ─────────────────────────────────────────────

  const visibleActivities =
    activeTab === "all" || activeTab === "updates" ? activities : [];
  const visibleMentions =
    activeTab === "all" || activeTab === "mentions" ? mentions : [];

  const isLoading =
    (activeTab === "updates" && loadingActivities) ||
    (activeTab === "mentions" && loadingMentions) ||
    (activeTab === "all" && (loadingActivities || loadingMentions));

  return (
    <header className="h-14 border-b border-border bg-background/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-5 gap-3 shrink-0">
      <div className="flex items-center min-w-0">
        {title && (
          <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {/* Search — relocated to the right cluster */}
        <button
          onClick={openSearch}
          aria-label={`${t("common.search")} pages, projects`}
          className="flex items-center gap-2.5 h-9 px-3 w-56 sm:w-72 rounded-xl border border-border bg-muted/40 hover:bg-muted/80 hover:border-foreground/20 text-muted-foreground text-sm transition-all group"
        >
          <Search className="w-3.5 h-3.5 shrink-0 group-hover:text-foreground transition-colors" />
          <span className="flex-1 text-left text-sm truncate">{t("common.search")} pages, projects…</span>
          <div className="hidden sm:flex items-center gap-0.5 shrink-0">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border border-border rounded">⌘K</kbd>
          </div>
        </button>

        <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="h-8 w-8" title="Toggle theme">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setNotifOpen((o) => !o)}
          >
            <Bell className="h-4 w-4" />
            {totalUnread > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {totalUnread > 9 ? "9+" : totalUnread}
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
                className="absolute right-0 top-10 w-96 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {totalUnread > 0 && (
                    <button
                      onClick={markAllRead}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                    >
                      <CheckCheck className="w-3 h-3" />
                      {t("common.mark_read")}
                    </button>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                  {([
                    { id: "all" as TabId, label: "All", count: totalUnread, icon: Bell },
                    { id: "mentions" as TabId, label: "Mentions", count: unreadMentions, icon: AtSign },
                    { id: "updates" as TabId, label: "Updates", count: unreadActivities, icon: Activity },
                  ]).map(({ id, label, count, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-colors relative",
                        activeTab === id ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon className="h-3 w-3" />
                      {label}
                      {count > 0 && (
                        <span className="min-w-[16px] h-4 rounded-full bg-primary/10 text-primary px-1 text-[9px] font-bold leading-4 text-center">
                          {count}
                        </span>
                      )}
                      {activeTab === id && (
                        <motion.div
                          layoutId="notif-tab-indicator"
                          className="absolute bottom-0 left-3 right-3 h-0.5 bg-primary rounded-full"
                        />
                      )}
                    </button>
                  ))}
                </div>

                {/* Content */}
                <div className="max-h-[380px] overflow-y-auto">
                  {isLoading ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                  ) : visibleMentions.length === 0 && visibleActivities.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">{t("notif.empty")}</div>
                  ) : (
                    <>
                      {/* Mentions */}
                      {visibleMentions.map((mention) => {
                        const isUnread = !readMentionIds.has(mention.id);
                        return (
                          <div
                            key={`m-${mention.id}`}
                            onClick={() => setReadMentionIds((r) => new Set([...r, mention.id]))}
                            className="flex gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors border-b border-border/40 last:border-0"
                          >
                            <div className="mt-0.5 relative shrink-0">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold bg-violet-500">
                                {mention.user?.initials || mention.user?.name?.slice(0, 2).toUpperCase() || "@"}
                              </div>
                              {isUnread && (
                                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full border border-card" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1 mb-0.5">
                                <AtSign className="h-2.5 w-2.5 text-violet-500 shrink-0" />
                                <span className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">Mention</span>
                                {mention.channelName && (
                                  <span className="text-[10px] text-muted-foreground">· #{mention.channelName}</span>
                                )}
                              </div>
                              <p className="text-xs font-medium leading-snug line-clamp-2">{mention.content}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {formatDistanceToNow(new Date(mention.createdAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        );
                      })}

                      {/* Activities */}
                      {visibleActivities.map((activity) => {
                        const isUnread = !readActivityIds.has(activity.id);
                        const color = ACTIVITY_COLORS[activity.type] || FRIDAY_TOKENS.activity.fallback;
                        return (
                          <div
                            key={`a-${activity.id}`}
                            onClick={() => setReadActivityIds((r) => new Set([...r, activity.id]))}
                            className="flex gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors border-b border-border/40 last:border-0"
                          >
                            <div className="mt-0.5 relative shrink-0">
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
                              <div className="flex items-center gap-1 mb-0.5">
                                <MessageSquare className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                <span className="text-[10px] text-muted-foreground font-medium">Update</span>
                              </div>
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
                      })}
                    </>
                  )}
                </div>

                <div className="px-4 py-2.5 border-t border-border bg-muted/30 flex gap-3">
                  <a
                    href="/dashboard/activity"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setNotifOpen(false)}
                  >
                    {t("notif.view_all")}
                  </a>
                  <span className="text-muted-foreground/30">·</span>
                  <a
                    href="/dashboard/chat"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setNotifOpen(false)}
                  >
                    Open Chat
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
