"use client";

// Tiny toast — no library, no provider. Imperative API:
//   import { showToast } from "@/components/toast";
//   showToast("Link copied to clipboard");
//
// Uses a portal-style root that's mounted lazily on first call. Each
// toast auto-dismisses after 2.4s. Multiple toasts stack vertically.

import { useEffect, useState } from "react";

interface ToastEntry {
  id: number;
  text: string;
  tone: "info" | "success" | "warning" | "danger";
}

let nextId = 1;
const listeners = new Set<(toasts: ToastEntry[]) => void>();
let queue: ToastEntry[] = [];

function emit() {
  for (const l of listeners) l([...queue]);
}

export function showToast(text: string, tone: ToastEntry["tone"] = "success") {
  const id = nextId++;
  queue.push({ id, text, tone });
  emit();
  setTimeout(() => {
    queue = queue.filter((t) => t.id !== id);
    emit();
  }, 2400);
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  useEffect(() => {
    const cb = (t: ToastEntry[]) => setToasts(t);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={
            "pointer-events-auto rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur-md transition-all " +
            (t.tone === "success"
              ? "border-emerald-200 bg-emerald-50/95 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100"
              : t.tone === "warning"
                ? "border-amber-200 bg-amber-50/95 text-amber-900 dark:border-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                : t.tone === "danger"
                  ? "border-red-200 bg-red-50/95 text-red-900 dark:border-red-900 dark:bg-red-900/40 dark:text-red-100"
                  : "border-border bg-card/95 text-foreground")
          }
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
