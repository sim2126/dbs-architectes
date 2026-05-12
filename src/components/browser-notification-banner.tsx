"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getPusherClient } from "@/platform/integrations/pusher-client";

const PREF_KEY = "dbs-notif-pref"; // "granted" | "denied" | "deferred"

export function BrowserNotificationBanner() {
  const [visible, setVisible] = useState(false);

  // Defined before the useEffect that calls it to satisfy no-use-before-define
  const subscribeToNotifications = useCallback(() => {
    try {
      const client = getPusherClient();
      const channel = client.subscribe("private-global-notifications");
      channel.bind("new-message", (data: { title: string; body: string; icon?: string }) => {
        if (document.visibilityState === "hidden") {
          new Notification(data.title, {
            body: data.body,
            icon: data.icon ?? "/favicon.ico",
          });
        }
      });
    } catch {
      // Pusher not configured — silent fail
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    const pref = localStorage.getItem(PREF_KEY);
    if (Notification.permission === "default" && pref !== "deferred" && pref !== "denied") {
      const t = setTimeout(() => setVisible(true), 2500);
      return () => clearTimeout(t);
    }

    if (Notification.permission === "granted") {
      subscribeToNotifications();
    }
  }, [subscribeToNotifications]);

  const handleEnable = async () => {
    setVisible(false);
    const permission = await Notification.requestPermission();
    localStorage.setItem(PREF_KEY, permission);
    if (permission === "granted") {
      subscribeToNotifications();
    }
  };

  const handleDefer = () => {
    setVisible(false);
    localStorage.setItem(PREF_KEY, "deferred");
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 60, scale: 0.96 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] w-[calc(100vw-2rem)] max-w-sm"
        >
          <div className="rounded-2xl border border-border bg-card shadow-2xl px-5 py-4 flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Bell className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug">Enable notifications</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Get browser alerts for new messages, mentions, and project updates — even when the tab is in the background.
              </p>
              <div className="flex items-center gap-2 mt-3">
                <Button size="sm" className="h-7 text-xs" onClick={handleEnable}>
                  Enable
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={handleDefer}>
                  Maybe Later
                </Button>
              </div>
            </div>
            <button onClick={handleDefer} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
