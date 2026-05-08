"use client";

import * as React from "react";
import { I } from "@/components/friday/icons";
import { EmptyState } from "@/components/friday/empty-state";
import { showToast } from "@/components/toast";
import { BlocksView } from "@/components/agent-blocks";
import type { Block } from "@/lib/agent/blocks";
import { cn } from "@/lib/utils";

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

function fmtSavedAt(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days === 0) return "Saved today";
  if (days === 1) return "Saved yesterday";
  if (days < 7) return `Saved ${days} days ago`;
  if (days < 14) return "Saved last week";
  if (days < 30) return `Saved ${Math.round(days / 7)} weeks ago`;
  return `Saved ${Math.round(days / 30)} mo ago`;
}

function SectionHeading({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-2 mt-1.5 mb-3 text-[9.5px] tracking-[0.18em] uppercase text-friday-fg-muted font-medium">
      <span>{label}</span>
      <span className="flex-1 h-px bg-friday-border-soft" />
      <span className="font-mono text-[9.5px] text-friday-fg-subtle tracking-wide">
        {count}
      </span>
    </div>
  );
}

function CardIconBtn({
  children,
  title,
  onClick,
  danger,
  active,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "w-[26px] h-[26px] p-0 bg-transparent border-0 rounded-sm cursor-pointer flex items-center justify-center transition-colors duration-100",
        active
          ? "text-[#b45309]"
          : danger
            ? "text-friday-fg-muted hover:text-[#9b2c1a] hover:bg-[#fde4dd]"
            : "text-friday-fg-muted hover:bg-friday-surface-2 hover:text-friday-fg",
      )}
    >
      {children}
    </button>
  );
}

function SavedCard({
  item,
  onRename,
  onPin,
  onDelete,
}: {
  item: SavedItem;
  onRename: (id: string, title: string) => void;
  onPin: (item: SavedItem) => void;
  onDelete: (id: string) => void;
}) {
  const [hover, setHover] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.title);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setDraft(item.title);
  }, [item.title]);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== item.title) {
      onRename(item.id, next);
    } else {
      setDraft(item.title);
    }
  };

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="bg-friday-bg border border-friday-border-soft rounded-md overflow-hidden mb-3.5"
      style={{
        boxShadow: item.pinned
          ? "0 0 0 1.5px rgba(233,184,80,0.55)"
          : undefined,
      }}
    >
      <div
        className="bg-friday-surface border-b border-friday-border-soft px-3.5 py-2.5 flex items-center gap-2"
        style={{ minHeight: 44 }}
      >
        {item.pinned ? (
          <span
            title="Pinned"
            className="leading-none mr-0.5"
            style={{ color: "#b45309" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 3l5 5-3 1-4 4 1 5-3-3-5 5-1-1 5-5-3-3 5-1 4-4 1-3z" />
            </svg>
          </span>
        ) : null}
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename();
                } else if (e.key === "Escape") {
                  setDraft(item.title);
                  setEditing(false);
                }
              }}
              className="w-full h-6 -my-0.5 -ml-1.5 px-1.5 border border-friday-accent rounded-[3px] bg-friday-bg outline-none font-display italic font-medium text-[15px] text-friday-fg"
              style={{
                boxShadow: "0 0 0 3px var(--friday-accent-ring)",
              }}
            />
          ) : (
            <h3
              onClick={() => setEditing(true)}
              className="font-display italic font-medium text-[15px] text-friday-fg m-0 -tracking-[0.1px] leading-snug cursor-text truncate"
            >
              {item.title}
            </h3>
          )}
        </div>

        <span className="text-[11px] text-friday-fg-subtle whitespace-nowrap">
          {fmtSavedAt(new Date(item.createdAt))}
        </span>

        <div
          className="flex items-center gap-px transition-opacity duration-150"
          style={{
            opacity: hover || editing ? 1 : 0,
            pointerEvents: hover || editing ? "auto" : "none",
          }}
        >
          <CardIconBtn title="Rename" onClick={() => setEditing(true)}>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 20h4l10-10-4-4L4 16v4z" />
              <path d="M14 6l4 4" />
            </svg>
          </CardIconBtn>
          <CardIconBtn
            title={item.pinned ? "Unpin" : "Pin"}
            onClick={() => onPin(item)}
            active={item.pinned}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill={item.pinned ? "#b45309" : "none"}
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16 3l5 5-3 1-4 4 1 5-3-3-5 5-1-1 5-5-3-3 5-1 4-4 1-3z" />
            </svg>
          </CardIconBtn>
          <CardIconBtn
            title="Delete"
            onClick={() => onDelete(item.id)}
            danger
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
            </svg>
          </CardIconBtn>
        </div>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3.5">
        {item.blocks && item.blocks.length > 0 ? (
          <BlocksView blocks={item.blocks} />
        ) : (
          <p
            className="text-friday-fg leading-relaxed m-0 whitespace-pre-wrap"
            style={{
              fontFamily: "var(--font-friday-serif), Georgia, serif",
              fontSize: 14,
              lineHeight: 1.65,
            }}
          >
            {item.text}
          </p>
        )}
      </div>
    </article>
  );
}

export default function SavedInsightsPage() {
  const [items, setItems] = React.useState<SavedItem[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchItems = React.useCallback(async () => {
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

  React.useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const onRename = async (id: string, title: string) => {
    setItems((prev) => prev.map((p) => (p.id === id ? { ...p, title } : p)));
    showToast("Renamed");
    try {
      await fetch(`/api/ai-saved/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
    } catch {
      fetchItems();
    }
  };

  const onPin = async (item: SavedItem) => {
    const next = !item.pinned;
    setItems((prev) =>
      prev.map((p) => (p.id === item.id ? { ...p, pinned: next } : p)),
    );
    showToast(next ? "Pinned" : "Unpinned");
    try {
      await fetch(`/api/ai-saved/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: next }),
      });
    } catch {
      fetchItems();
    }
  };

  const onDelete = async (id: string) => {
    setItems((prev) => prev.filter((p) => p.id !== id));
    showToast("Deleted");
    try {
      await fetch(`/api/ai-saved/${id}`, { method: "DELETE" });
    } catch {
      fetchItems();
    }
  };

  const sorted = React.useMemo(() => {
    const pinned = items
      .filter((s) => s.pinned)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    const rest = items
      .filter((s) => !s.pinned)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    return { pinned, rest };
  }, [items]);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-friday-bg">
      <div
        className="px-7 border-b border-friday-border-soft flex items-center gap-2.5 shrink-0"
        style={{ height: 60 }}
      >
        <span className="text-friday-fg-muted leading-none">
          <I.Star size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <h1 className="font-display italic font-medium text-[24px] text-friday-fg m-0 -tracking-[0.3px] leading-[1.15]">
            Saved Insights
          </h1>
          <div className="text-[11.5px] text-friday-fg-muted mt-0.5">
            <span className="font-mono tracking-wide">{items.length}</span>{" "}
            saved
            <span className="text-friday-fg-subtle mx-1.5">·</span>
            <span className="font-mono tracking-wide">
              {sorted.pinned.length}
            </span>{" "}
            pinned
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="text-[12px] text-friday-fg-muted text-center py-16">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="max-w-[460px] mx-auto mt-20">
            <EmptyState
              icon={<I.Star size={22} />}
              title="Nothing saved yet"
              body="When DBS GPT gives you a useful answer, hit the bookmark icon and it'll land here for quick reference later."
            />
          </div>
        ) : (
          <div
            className="mx-auto"
            style={{ maxWidth: 880, padding: "24px 28px 60px" }}
          >
            {sorted.pinned.length > 0 ? (
              <>
                <SectionHeading label="Pinned" count={sorted.pinned.length} />
                {sorted.pinned.map((s) => (
                  <SavedCard
                    key={s.id}
                    item={s}
                    onRename={onRename}
                    onPin={onPin}
                    onDelete={onDelete}
                  />
                ))}
              </>
            ) : null}
            {sorted.rest.length > 0 ? (
              <>
                {sorted.pinned.length > 0 ? <div className="h-4" /> : null}
                <SectionHeading label="All saved" count={sorted.rest.length} />
                {sorted.rest.map((s) => (
                  <SavedCard
                    key={s.id}
                    item={s}
                    onRename={onRename}
                    onPin={onPin}
                    onDelete={onDelete}
                  />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
