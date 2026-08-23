"use client";

import { useState } from "react";
import { CheckCircle2, Link2, Loader2 } from "lucide-react";
import { showToast } from "@/ui/components/toast";
import { cn } from "@/ui/utils";

/**
 * Thread header actions — turn a conversation into work, or share it.
 *
 * This is the seam that makes chat worth having inside the workspace rather
 * than beside it: a decision reached in a thread becomes a WorkItem without
 * anyone retyping it. Slack cannot do this; it is the reason ClickUp puts
 * "Create Task" at the top of every thread.
 *
 * The task title comes from the thread's opening message, truncated. It is
 * deliberately not AI-generated — a wrong title on a real task costs more
 * than a plain one, and the user can rename it immediately.
 */
export function ThreadActions({
  threadId,
  sourceText,
  projectId,
  channelId,
  canCreateTask = true,
}: {
  threadId: string;
  sourceText: string;
  /** Set when the channel is project-scoped, so the task lands on the project. */
  projectId?: string | null;
  channelId: string;
  canCreateTask?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);

  const createTask = async () => {
    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: taskTitleFrom(sourceText),
          // The full message is the description, so context is not lost to
          // the title's truncation.
          description: sourceText,
          projectId: projectId ?? undefined,
          sourceMessageId: threadId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        showToast(body?.error ?? "Could not create the task.", "danger");
        return;
      }
      setCreated(true);
      showToast("Task created from this thread", "success");
    } catch {
      showToast("Could not create the task. Please try again.", "danger");
    } finally {
      setCreating(false);
    }
  };

  const copyLink = async () => {
    const params = new URLSearchParams({ channel: channelId, thread: threadId });
    const url = `${window.location.origin}${window.location.pathname}?${params}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Thread link copied", "success");
    } catch {
      // Clipboard is permission-gated and blocked in some contexts. Say so
      // rather than failing silently.
      showToast("Could not copy — check clipboard permissions.", "warning");
    }
  };

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 border-b border-friday-border-soft shrink-0">
      {canCreateTask && (
        <button
          type="button"
          onClick={createTask}
          disabled={creating || created}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs",
            "border border-border hover:bg-friday-surface-2 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:opacity-60",
          )}
        >
          {creating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="h-3.5 w-3.5" />
          )}
          {created ? "Task created" : "Create task"}
        </button>
      )}

      <button
        type="button"
        onClick={copyLink}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs",
          "border border-border hover:bg-friday-surface-2 transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Link2 className="h-3.5 w-3.5" />
        Copy link
      </button>
    </div>
  );
}

/** First line, capped. A task title is a label, not a transcript. */
export function taskTitleFrom(text: string): string {
  const firstLine = text.split("\n").find((l) => l.trim() !== "")?.trim() ?? "Follow-up";
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine;
}
