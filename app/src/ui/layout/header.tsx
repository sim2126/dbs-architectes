"use client";

import { Bell, Moon, Sun, Search, CheckCheck, AtSign, Activity, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/ui/components/button";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useT } from "@/i18n/translations";
import { getPusherClient } from "@/platform/integrations/pusher-client";
import { NOTIFICATION_EVENT, userChannelName } from "@/platform/integrations/pusher-channels";
import { useSession } from "next-auth/react";
import { cn } from "@/ui/utils";
import { useAssistantStore } from "@/ui/stores/assistant-store";
import { usePathname } from "next/navigation";

// ─── Types ─────────────────────────────────────────────────────

/**
 * Wire shape of GET /api/notifications, one row per thing this user was
 * told. Mirrors NotificationDTO in features/notifications/domain; declared
 * here because ui/ does not import from features/.
 */
interface NotificationItem {
  id: string;
  type: string;
  category: "mentions" | "updates";
  title: string;
  body: string | null;
  href: string | null;
  projectCode: string | null;
  actor: { name: string | null; initials: string | null } | null;
  readAt: string | null;
  createdAt: string;
}

type TabId = "all" | "mentions" | "updates";

const PAGE_SIZE = 20;

// ─── Header ────────────────────────────────────────────────────

export function Header({ title }: { title?: string }) {
  const t = useT();
  const { data: session } = useSession();
  const isExternal = session?.user?.isExternal === true;
  const userId = session?.user?.id;
  const [darkMode, setDarkMode] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());

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

  // ── Load notifications ──────────────────────────────────────
  // Fetched once on mount so the badge is honest before the panel is ever
  // opened, then kept current by the personal channel below.

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        unreadCount: number;
      };
      for (const n of data.notifications) seen.current.add(n.id);
      setItems(data.notifications);
      setUnread(data.unreadCount);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Real-time ───────────────────────────────────────────────
  // Only this user can subscribe to private-user-{id}; the server refuses
  // anyone else, so what arrives here is addressed to us.

  useEffect(() => {
    if (!userId) return;
    const channelName = userChannelName(userId);
    let client: ReturnType<typeof getPusherClient> | null = null;
    try {
      client = getPusherClient();
      const channel = client.subscribe(channelName);
      channel.bind(NOTIFICATION_EVENT, (item: NotificationItem) => {
        if (seen.current.has(item.id)) return;
        seen.current.add(item.id);
        setItems((prev) => [item, ...prev].slice(0, PAGE_SIZE));
        setUnread((n) => n + 1);
      });
    } catch {
      // Pusher not configured. The list still loads on mount; nothing live.
    }
    return () => {
      client?.unsubscribe(channelName);
    };
  }, [userId]);

  // ── Read state ──────────────────────────────────────────────
  // Optimistic: the row dims and the badge drops at once; the server is
  // told afterwards. If that fails, reload so the display matches the truth.

  const markRead = (item: NotificationItem) => {
    if (item.readAt) return;
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, readAt } : n)));
    setUnread((n) => Math.max(0, n - 1));
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [item.id] }),
    }).catch(() => load());
  };

  const markAllRead = () => {
    const readAt = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt })));
    setUnread(0);
    fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    }).catch(() => load());
  };

  // ── Tab content ─────────────────────────────────────────────

  const unreadIn = (category: TabId) =>
    items.filter((n) => !n.readAt && n.category === category).length;
  const visible = items.filter((n) => activeTab === "all" || n.category === activeTab);

  return (
    <header className="relative h-14 border-b border-border bg-background/95 backdrop-blur-md sticky top-0 z-30 flex items-center justify-between px-5 gap-3 shrink-0">
      <div className="flex items-center min-w-0">
        {title && (
          <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
        )}
      </div>

      {/*
       * Search is centred and paired with the assistant, matching the
       * reference. Absolutely positioned rather than placed in the flex row
       * so it stays optically centred in the viewport regardless of how wide
       * the page title on the left happens to be.
       */}
      {!isExternal && <div className="absolute left-1/2 -translate-x-1/2 hidden md:flex items-center gap-2">
        <button
          onClick={openSearch}
          aria-label={`${t("common.search")} pages, projects`}
          className="flex items-center gap-2.5 h-9 px-3.5 w-64 lg:w-80 rounded-full border border-border bg-muted/40 hover:bg-muted/80 hover:border-foreground/20 text-muted-foreground text-sm transition-all group"
        >
          <Search className="w-3.5 h-3.5 shrink-0 group-hover:text-foreground transition-colors" />
          <span className="flex-1 text-left text-sm truncate">
            Can&rsquo;t find it? Search here
          </span>
        </button>

        <AssistantPill />
      </div>}

      <div className="flex items-center gap-2 shrink-0">
        {/* Compact search for viewports too narrow for the centred pair. */}
        {!isExternal && <button
          onClick={openSearch}
          aria-label={`${t("common.search")} pages, projects`}
          className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Search className="w-4 h-4" />
        </button>}

        <Button variant="ghost" size="icon" onClick={toggleDarkMode} className="h-8 w-8" title="Toggle theme">
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        {/* Notification bell */}
        <div className="relative" ref={notifRef}>
          <Button
            aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
            aria-expanded={notifOpen}
            aria-haspopup="dialog"
            variant="ghost"
            size="icon"
            className="h-8 w-8 relative"
            onClick={() => setNotifOpen((o) => !o)}
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span
                aria-hidden
                className="absolute top-1 right-1 min-w-4 h-4 px-0.5 bg-friday-error-fg text-white rounded-full text-[9px] flex items-center justify-center font-bold"
              >
                {unread > 9 ? "9+" : unread}
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
                role="dialog"
                aria-label="Notifications"
                className="absolute right-0 top-10 w-96 bg-card border border-border rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {unread > 0 && (
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
                <div className="flex border-b border-border" role="tablist">
                  {([
                    { id: "all" as TabId, label: "All", count: unread, icon: Bell },
                    { id: "mentions" as TabId, label: "Mentions", count: unreadIn("mentions"), icon: AtSign },
                    { id: "updates" as TabId, label: "Updates", count: unreadIn("updates"), icon: Activity },
                  ]).map(({ id, label, count, icon: Icon }) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={activeTab === id}
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
                  {loading && items.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
                  ) : visible.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">{t("notif.empty")}</div>
                  ) : (
                    visible.map((item) => {
                      const isUnread = !item.readAt;
                      const isMention = item.category === "mentions";
                      const initials =
                        item.actor?.initials ||
                        item.actor?.name?.slice(0, 2).toUpperCase() ||
                        (isMention ? "@" : "·");
                      return (
                        <Link
                          key={item.id}
                          href={item.href ?? "/dashboard/activity"}
                          onClick={() => {
                            markRead(item);
                            setNotifOpen(false);
                          }}
                          className="flex gap-3 px-4 py-3 hover:bg-accent/50 cursor-pointer transition-colors border-b border-border/40 last:border-0"
                        >
                          <div className="mt-0.5 relative shrink-0">
                            <div
                              className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold",
                                isMention
                                  ? "bg-friday-accent text-white"
                                  : "bg-friday-surface-3 text-friday-fg",
                              )}
                            >
                              {initials}
                            </div>
                            {isUnread && (
                              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-friday-accent rounded-full border border-card" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 mb-0.5">
                              {isMention ? (
                                <AtSign className="h-2.5 w-2.5 text-friday-accent shrink-0" />
                              ) : (
                                <Activity className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                              )}
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {isMention ? "Mention" : "Update"}
                              </span>
                              {item.projectCode && (
                                <span className="text-[10px] text-muted-foreground font-mono">· {item.projectCode}</span>
                              )}
                            </div>
                            <p className={cn("text-xs leading-snug line-clamp-2", isUnread ? "font-medium" : "text-muted-foreground")}>
                              {item.title}
                            </p>
                            {item.body && (
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{item.body}</p>
                            )}
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </Link>
                      );
                    })
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
                  <span className="text-friday-fg-subtle">·</span>
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

/**
 * DBS AI trigger, beside the search field.
 *
 * Sits here rather than in the sidebar because the assistant is useful
 * *while* looking at something — asking "what changed on Belvédère" from the
 * Belvédère page beats navigating to a separate assistant screen and losing
 * the context you were asking about.
 */
function AssistantPill() {
  const open = useAssistantStore((s) => s.open);
  const toggle = useAssistantStore((s) => s.toggle);
  const pathname = usePathname();

  const onFullPage = pathname?.startsWith("/dashboard/ai/gpt") ?? false;

  const styles = cn(
    "inline-flex items-center gap-1.5 h-9 rounded-full border px-3.5 text-sm transition-colors shrink-0",
    open || onFullPage
      ? "border-friday-accent bg-friday-accent-soft text-foreground"
      : "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/80",
  );

  /*
   * On the full DBS AI page the pill stays visible and reads as active, but
   * it is a link to that page rather than a panel toggle. Toggling would open
   * a second assistant beside the first — two conversations writing to one
   * history — so clicking simply keeps you on the screen you are already on.
   */
  if (onFullPage) {
    return (
      <Link href="/dashboard/ai/gpt" aria-current="page" className={styles}>
        <Sparkles className="h-3.5 w-3.5 text-friday-accent shrink-0" />
        DBS AI
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      aria-label="DBS AI"
      className={styles}
    >
      <Sparkles className="h-3.5 w-3.5 text-friday-accent shrink-0" />
      DBS AI
    </button>
  );
}
