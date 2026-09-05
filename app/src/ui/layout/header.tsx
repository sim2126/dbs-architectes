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
import { usePathname, useRouter } from "next/navigation";

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
  const router = useRouter();
  const { data: session } = useSession();
  const isExternal = session?.user?.isExternal === true;
  const userId = session?.user?.id;
  const [darkMode, setDarkMode] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [savingRead, setSavingRead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadByCategory, setUnreadByCategory] = useState({ mentions: 0, updates: 0 });
  const notifRef = useRef<HTMLDivElement>(null);
  const loadVersion = useRef(0);
  const refreshNotifications = useRef<() => Promise<void>>(async () => {});
  const invalidateLoads = useCallback(() => { loadVersion.current++; }, []);

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
  // Fetch on mount/open and recover missed events on focus or reconnect.
  const load = useCallback(async (cursor?: string) => {
    if (!userId) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) query.set("cursor", cursor);
      if (activeTab !== "all") query.set("category", activeTab);
      const res = await fetch(`/api/notifications?${query}`, { cache: "no-store" });
      if (!res.ok) {
        if (version === loadVersion.current && (res.status === 401 || res.status === 403)) {
          setItems([]);
          setUnread(0);
          setUnreadByCategory({ mentions: 0, updates: 0 });
          setNextCursor(null);
        }
        throw new Error("Notifications could not be loaded. Please try again.");
      }
      const data = (await res.json()) as {
        notifications: NotificationItem[];
        unreadCount: number;
        unreadByCategory: { mentions: number; updates: number };
        hasMore: boolean;
        nextCursor: string | null;
      };
      if (version !== loadVersion.current) return;
      setItems((previous) => cursor
        ? [...previous, ...data.notifications.filter((item) => !previous.some((row) => row.id === item.id))]
        : data.notifications);
      setUnread(data.unreadCount);
      setUnreadByCategory(data.unreadByCategory);
      setNextCursor(data.hasMore ? data.nextCursor : null);
    } catch (cause) {
      if (version === loadVersion.current) setError(cause instanceof Error ? cause.message : "Notifications could not be loaded.");
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [userId, activeTab]);

  useEffect(() => {
    refreshNotifications.current = () => load();
    setItems([]);
    setNextCursor(null);
    void load();
    return invalidateLoads;
  }, [load, invalidateLoads]);

  useEffect(() => {
    const recover = () => { if (document.visibilityState === "visible") void load(); };
    window.addEventListener("focus", recover);
    window.addEventListener("online", recover);
    document.addEventListener("visibilitychange", recover);
    return () => {
      window.removeEventListener("focus", recover);
      window.removeEventListener("online", recover);
      document.removeEventListener("visibilitychange", recover);
    };
  }, [load]);

  // ── Real-time ───────────────────────────────────────────────
  // Only this user can subscribe to private-user-{id}; the server refuses
  // anyone else, so what arrives here is addressed to us.

  useEffect(() => {
    if (!userId) return;
    const channelName = userChannelName(userId);
    let client: ReturnType<typeof getPusherClient> | null = null;
    const refresh = () => { void load(); };
    try {
      client = getPusherClient();
      const channel = client.subscribe(channelName);
      channel.bind(NOTIFICATION_EVENT, refresh);
      channel.bind("pusher:subscription_succeeded", refresh);
      client.connection.bind("connected", refresh);
    } catch {
      // Opening the panel and returning to the tab still recover missed updates.
    }
    return () => {
      client?.connection.unbind("connected", refresh);
      client?.unsubscribe(channelName);
    };
  }, [userId, load]);

  // ── Read state ──────────────────────────────────────────────
  // Keep unread state until the server confirms the write, including HTTP errors.
  const markRead = async (item?: NotificationItem): Promise<boolean> => {
    if (item?.readAt) return true;
    if (savingRead) return false;
    setSavingRead(true);
    setError(null);
    ++loadVersion.current;
    setLoading(false);
    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item ? { ids: [item.id] } : { all: true }),
      });
      if (!res.ok) throw new Error("Notifications could not be marked as read. Please try again.");
      const readAt = new Date().toISOString();
      setItems((previous) => previous.map((row) => !item || row.id === item.id ? { ...row, readAt } : row));
      await refreshNotifications.current();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Notifications could not be marked as read.");
      return false;
    } finally {
      setSavingRead(false);
    }
  };

  // ── Tab content ─────────────────────────────────────────────

  const unreadIn = (category: "mentions" | "updates") => unreadByCategory[category];
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
            onClick={() => {
              if (!notifOpen) void load();
              setNotifOpen((o) => !o);
            }}
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
                      onClick={() => { void markRead(); }}
                      disabled={savingRead}
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
                  {error && (
                    <div role="alert" className="px-4 py-3 text-xs text-friday-error-fg">
                      {error} <button onClick={() => { setError(null); void load(); }} className="underline">Retry</button>
                    </div>
                  )}
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
                          onClick={async (event) => {
                            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                            event.preventDefault();
                            if (await markRead(item)) {
                              setNotifOpen(false);
                              router.push(item.href?.startsWith("/dashboard/") ? item.href : "/dashboard/activity");
                            }
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
                  {nextCursor && <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    disabled={loading}
                    onClick={() => { void load(nextCursor); }}
                  >
                    {loading ? t("common.loading") : "Load more notifications"}
                  </button>}
                  {nextCursor && <span className="text-friday-fg-subtle">·</span>}
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
