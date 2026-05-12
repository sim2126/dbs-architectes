"use client";

// Saved DBS GPT insights — snapshots of DBS AI responses the user wants to
// keep. Pinned items float to the top. Each card shows the saved blocks
// rendered with the same components used in the live chat.

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bookmark, Loader2, Pin, PinOff, Trash2, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/ui/utils";
import { BlocksView } from "@/features/ai/client/agent-blocks";
import type { Block } from "@/features/ai/server/agent/blocks";

interface SavedItem {
  id: string;
  title: string;
  text: string;
  blocks: Block[];
  pinned: boolean;
  sessionId: string | null;
  messageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function SavedInsightsPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-saved");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SavedItem[];
      setItems(data);
    } catch (err) {
      console.error("[saved-ai] fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const togglePin = async (item: SavedItem) => {
    const next = !item.pinned;
    setItems((prev) => {
      const updated = prev.map((p) => (p.id === item.id ? { ...p, pinned: next } : p));
      return updated.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    });
    try {
      await fetch(`/api/ai-saved/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
    } catch (err) {
      console.error("[saved-ai] pin failed:", err);
      fetchItems();
    }
  };

  const remove = async (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    try {
      await fetch(`/api/ai-saved/${id}`, { method: "DELETE" });
    } catch (err) {
      console.error("[saved-ai] delete failed:", err);
      fetchItems();
    }
  };

  const startRename = (item: SavedItem) => {
    setEditingId(item.id);
    setEditValue(item.title);
  };

  const commitRename = async (id: string) => {
    const title = editValue.trim();
    setEditingId(null);
    if (!title) return;
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
    try {
      await fetch(`/api/ai-saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch (err) {
      console.error("[saved-ai] rename failed:", err);
      fetchItems();
    }
  };

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col bg-background">
      <div className="shrink-0 border-b border-border bg-card/70 px-6 py-3.5 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center gap-2">
          <Bookmark className="h-4 w-4 text-amber-500" />
          <h1 className="text-sm font-semibold">Saved Insights</h1>
          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {items.length}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
                <Bookmark className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-semibold">Nothing saved yet</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                When DBS GPT gives you a useful answer, hit the bookmark icon and
                it&apos;ll land here for quick reference later.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {items.map((item) => (
                  <motion.article
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 16 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      "rounded-[24px] border border-border bg-card shadow-sm",
                      item.pinned && "border-amber-300/70 ring-1 ring-amber-300/40",
                    )}
                  >
                    <header className="flex items-start gap-3 border-b border-border px-5 py-3">
                      <div className="min-w-0 flex-1">
                        {editingId === item.id ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={() => commitRename(item.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitRename(item.id);
                              if (e.key === "Escape") setEditingId(null);
                            }}
                            className="w-full bg-transparent text-sm font-semibold outline-none border-b border-foreground"
                          />
                        ) : (
                          <h2 className="truncate text-sm font-semibold">{item.title}</h2>
                        )}
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          Saved {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {item.pinned && (
                          <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 sm:inline-flex">
                            Pinned
                          </span>
                        )}
                        <button
                          onClick={() => startRename(item)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          title="Rename"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => togglePin(item)}
                          className={cn(
                            "rounded-md p-1.5 transition-colors",
                            item.pinned
                              ? "text-amber-600 hover:bg-amber-50"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                          title={item.pinned ? "Unpin" : "Pin"}
                        >
                          {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => remove(item.id)}
                          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </header>
                    <div className="px-5 py-4">
                      {item.blocks && item.blocks.length > 0 ? (
                        <BlocksView blocks={item.blocks} />
                      ) : (
                        <p className="whitespace-pre-wrap text-sm leading-7">{item.text}</p>
                      )}
                    </div>
                  </motion.article>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
